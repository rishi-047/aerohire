"""
Docker Sandbox - Secure Code Execution Engine

Runs user-submitted code in an isolated Docker container with strict resource limits.
"""

import time
import textwrap
from typing import Any

# Try to import Docker client, fall back to mock mode if unavailable
try:
    import docker
    from docker.errors import DockerException, ContainerError, ImageNotFound, APIError

    _docker_client = docker.from_env()
    _docker_client.ping()  # Test connection
    DOCKER_AVAILABLE = True
    print("[Docker Sandbox] Docker is available and connected.")
except Exception as e:
    DOCKER_AVAILABLE = False
    _docker_client = None
    print(f"[Docker Sandbox] WARNING: Docker not available ({e}). Running in MOCK MODE.")


def _build_test_script(code: str, test_cases: list[dict[str, Any]]) -> str:
    """
    Build a Python script that wraps user code and runs test cases.

    Args:
        code: The user's submitted code
        test_cases: List of dicts with 'input' and 'expected' keys

    Returns:
        A complete Python script string
    """
    # Escape the code for embedding in a string
    escaped_code = code.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')

    test_script = textwrap.dedent(f'''
        import sys
        import json
        import traceback

        # User's submitted code
        try:
            exec("""{escaped_code}""")
        except Exception as e:
            print(json.dumps({{
                "status": "error",
                "error_type": "compilation",
                "message": str(e),
                "traceback": traceback.format_exc(),
                "tests_passed": 0,
                "tests_total": {len(test_cases)}
            }}))
            sys.exit(1)

        # Run test cases
        test_cases = {test_cases!r}
        passed = 0
        total = len(test_cases)
        results = []

        for i, tc in enumerate(test_cases):
            try:
                # Get the function to test (assume it's the last defined function)
                func_name = tc.get("function", "solution")
                if func_name not in dir():
                    # Try to find any callable
                    for name in reversed(list(dir())):
                        if callable(eval(name)) and not name.startswith("_"):
                            func_name = name
                            break

                func = eval(func_name)
                input_val = tc["input"]

                # Handle both single and multiple arguments
                if isinstance(input_val, (list, tuple)) and tc.get("unpack", False):
                    result = func(*input_val)
                else:
                    result = func(input_val)

                expected = tc["expected"]

                if result == expected:
                    passed += 1
                    results.append({{"test": i+1, "status": "passed"}})
                else:
                    results.append({{
                        "test": i+1,
                        "status": "failed",
                        "expected": expected,
                        "got": result
                    }})
            except Exception as e:
                results.append({{
                    "test": i+1,
                    "status": "error",
                    "message": str(e),
                    "traceback": traceback.format_exc()
                }})

        print(json.dumps({{
            "status": "success" if passed == total else "partial",
            "tests_passed": passed,
            "tests_total": total,
            "results": results
        }}))
    ''')

    return test_script.strip()


def _execute_in_docker(script: str, timeout: int = 5) -> dict[str, Any]:
    """
    Execute a Python script inside a Docker container with security constraints.

    Args:
        script: The Python script to execute
        timeout: Maximum execution time in seconds

    Returns:
        Dictionary with execution results
    """
    start_time = time.time()

    try:
        # Run in isolated container with strict limits
        result = _docker_client.containers.run(
            image="python:3.9-alpine",
            command=["python", "-c", script],
            mem_limit="128m",           # Memory limit
            network_disabled=True,       # No network access
            nano_cpus=500000000,         # 0.5 CPU limit
            remove=True,                 # Auto-cleanup
            stdout=True,
            stderr=True,
            detach=False,
        )

        execution_time = time.time() - start_time

        # Decode output
        output = result.decode("utf-8").strip() if result else ""

        # Try to parse JSON output
        try:
            import json
            parsed = json.loads(output)
            parsed["execution_time_ms"] = round(execution_time * 1000, 2)
            return parsed
        except json.JSONDecodeError:
            return {
                "status": "success",
                "output": output,
                "execution_time_ms": round(execution_time * 1000, 2),
            }

    except ContainerError as e:
        execution_time = time.time() - start_time
        stderr = e.stderr.decode("utf-8") if e.stderr else str(e)
        return {
            "status": "error",
            "error_type": "runtime",
            "message": stderr,
            "execution_time_ms": round(execution_time * 1000, 2),
        }

    except ImageNotFound:
        return {
            "status": "error",
            "error_type": "system",
            "message": "Docker image 'python:3.9-alpine' not found. Please pull it first.",
        }

    except APIError as e:
        return {
            "status": "error",
            "error_type": "docker",
            "message": f"Docker API error: {str(e)}",
        }

    except Exception as e:
        execution_time = time.time() - start_time
        return {
            "status": "error",
            "error_type": "unknown",
            "message": str(e),
            "execution_time_ms": round(execution_time * 1000, 2),
        }


def _execute_mock(code: str, test_cases: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Mock execution for development when Docker is not available.

    Actually executes the code in the current Python process (NOT SAFE FOR PRODUCTION).
    """
    import json

    start_time = time.time()

    try:
        # Create a restricted namespace
        namespace = {}

        # Execute the user's code
        exec(code, namespace)

        # Run test cases
        passed = 0
        total = len(test_cases)
        results = []

        for i, tc in enumerate(test_cases):
            try:
                func_name = tc.get("function", "solution")

                # Find the function in namespace
                if func_name not in namespace:
                    for name in reversed(list(namespace.keys())):
                        if callable(namespace.get(name)) and not name.startswith("_"):
                            func_name = name
                            break

                func = namespace.get(func_name)
                if not func:
                    raise ValueError(f"Function '{func_name}' not found")

                input_val = tc["input"]

                if isinstance(input_val, (list, tuple)) and tc.get("unpack", False):
                    result = func(*input_val)
                else:
                    result = func(input_val)

                expected = tc["expected"]

                if result == expected:
                    passed += 1
                    results.append({"test": i + 1, "status": "passed"})
                else:
                    results.append({
                        "test": i + 1,
                        "status": "failed",
                        "expected": expected,
                        "got": result,
                    })
            except Exception as e:
                results.append({
                    "test": i + 1,
                    "status": "error",
                    "message": str(e),
                })

        execution_time = time.time() - start_time

        return {
            "status": "success" if passed == total else "partial",
            "tests_passed": passed,
            "tests_total": total,
            "results": results,
            "execution_time_ms": round(execution_time * 1000, 2),
            "mock_mode": True,
        }

    except SyntaxError as e:
        return {
            "status": "error",
            "error_type": "syntax",
            "message": str(e),
            "execution_time_ms": round((time.time() - start_time) * 1000, 2),
            "mock_mode": True,
        }

    except Exception as e:
        return {
            "status": "error",
            "error_type": "runtime",
            "message": str(e),
            "execution_time_ms": round((time.time() - start_time) * 1000, 2),
            "mock_mode": True,
        }


def execute_code_safely(code: str, test_cases: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Execute user code safely against test cases.

    Uses Docker sandbox when available, falls back to mock mode for development.

    Args:
        code: The user's submitted Python code
        test_cases: List of test case dictionaries with keys:
            - input: The input value(s) to pass to the function
            - expected: The expected output
            - function: (optional) Name of function to test, defaults to "solution"
            - unpack: (optional) If True, unpack input as *args

    Returns:
        Dictionary containing:
            - status: "success", "partial", or "error"
            - tests_passed: Number of tests passed
            - tests_total: Total number of tests
            - results: List of individual test results
            - execution_time_ms: Execution time in milliseconds
            - mock_mode: (optional) True if running in mock mode

    Example:
        >>> code = "def solution(n): return n * 2"
        >>> test_cases = [
        ...     {"input": 2, "expected": 4},
        ...     {"input": 5, "expected": 10},
        ... ]
        >>> result = execute_code_safely(code, test_cases)
        >>> result["status"]
        'success'
    """
    if not code or not code.strip():
        return {
            "status": "error",
            "error_type": "validation",
            "message": "No code provided",
            "tests_passed": 0,
            "tests_total": len(test_cases),
        }

    if not test_cases:
        return {
            "status": "error",
            "error_type": "validation",
            "message": "No test cases provided",
            "tests_passed": 0,
            "tests_total": 0,
        }

    if DOCKER_AVAILABLE:
        script = _build_test_script(code, test_cases)
        return _execute_in_docker(script)
    else:
        return _execute_mock(code, test_cases)


def is_docker_available() -> bool:
    """Check if Docker is available for code execution."""
    return DOCKER_AVAILABLE
