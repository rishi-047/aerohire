"""
Zone Parser - Resume Section Extraction Engine

Extracts structured sections from PDF resumes using anchor-based zone detection.
No heavy NLP models required - uses smart regex and keyword matching.
"""

import re
from datetime import datetime
from typing import Optional

try:
    import pdfplumber

    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    print("[Zone Parser] WARNING: pdfplumber not installed. PDF parsing unavailable.")

try:
    import docx  # type: ignore

    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    print("[Zone Parser] WARNING: python-docx not installed. DOCX parsing unavailable.")


# Section Anchors - keywords that indicate the start of a section
SKILLS_ANCHORS = [
    "skills",
    "technical skills",
    "technologies",
    "technical stack",
    "tech stack",
    "competencies",
    "technical competencies",
    "core competencies",
    "programming languages",
    "tools & technologies",
    "tools and technologies",
    "skillset",
    "skills summary",
    "key skills",
    "technical proficiencies",
    "technical proficiency",
    "expertise",
    "areas of expertise",
    "tools",
]

EXPERIENCE_ANCHORS = [
    "experience",
    "work experience",
    "professional experience",
    "work history",
    "employment",
    "employment history",
    "career history",
    "professional background",
    "internship",
    "internships",
    "industrial experience",
    "work profile",
    "professional profile",
]

EDUCATION_ANCHORS = [
    "education",
    "qualifications",
    "academic",
    "academic background",
    "educational background",
    "degrees",
    "certifications",
    "certificates",
    "academic qualifications",
    "education details",
]

# All anchors combined for boundary detection
ALL_ANCHORS = SKILLS_ANCHORS + EXPERIENCE_ANCHORS + EDUCATION_ANCHORS + [
    "projects",
    "personal projects",
    "achievements",
    "awards",
    "publications",
    "references",
    "interests",
    "hobbies",
    "summary",
    "objective",
    "profile",
    "about me",
    "contact",
    "contact details",
    "profile summary",
    "professional summary",
]

SKILL_LEXICON = {
    "python": "Python",
    "java": "Java",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "c": "C",
    "c++": "C++",
    "c#": "C#",
    "go": "Go",
    "golang": "Go",
    "ruby": "Ruby",
    "php": "PHP",
    "sql": "SQL",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "sqlite": "SQLite",
    "mssql": "SQL Server",
    "mongo": "MongoDB",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "react": "React",
    "angular": "Angular",
    "vue": "Vue",
    "node": "Node.js",
    "node.js": "Node.js",
    "express": "Express",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "django": "Django",
    "spring": "Spring",
    "spring boot": "Spring Boot",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "terraform": "Terraform",
    "git": "Git",
    "linux": "Linux",
    "pandas": "Pandas",
    "numpy": "NumPy",
    "scikit-learn": "Scikit-learn",
    "tensorflow": "TensorFlow",
    "pytorch": "PyTorch",
    "ml": "Machine Learning",
    "machine learning": "Machine Learning",
    "data science": "Data Science",
    "power bi": "Power BI",
    "tableau": "Tableau",
    "excel": "Excel",
    "rest": "REST",
    "rest api": "REST",
    "graphql": "GraphQL",
    "spark": "Spark",
    "hadoop": "Hadoop",
    "android": "Android",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "flutter": "Flutter",
    "dart": "Dart",
    "html": "HTML",
    "css": "CSS",
    "vmware": "VMware",
    "vsphere": "vSphere",
    "vcenter": "vCenter",
    "vsan": "vSAN",
    "nsx": "NSX",
    "iscsi": "iSCSI",
    "nfs": "NFS",
    "fc": "Fibre Channel",
    "dhcp": "DHCP",
    "dns": "DNS",
    "active directory": "Active Directory",
    "group policy": "Group Policy",
    "powershell": "PowerShell",
    "redhat": "Red Hat",
    "rhcsa": "RHCSA",
    "rhce": "RHCE",
    "itil": "ITIL",
    "incident management": "Incident Management",
    "change management": "Change Management",
    "backup": "Backup",
    "disaster recovery": "Disaster Recovery",
    "ansible": "Ansible",
    "servicenow": "ServiceNow",
}


def _estimate_years_experience(text: str) -> Optional[int]:
    """
    Estimate total years of experience from resume text using regex heuristics.
    """
    if not text:
        return None

    current_year = datetime.now().year
    spans: list[int] = []
    explicit_years: list[int] = []

    range_pattern = re.compile(r"(?P<start>(?:19|20)\d{2})\s*[-–—]\s*(?P<end>(?:19|20)\d{2})")
    present_pattern = re.compile(r"(?P<start>(?:19|20)\d{2})\s*[-–—]\s*(present|current|now)", re.IGNORECASE)
    years_pattern = re.compile(r"(\d+)\+?\s*(years|yrs)\b", re.IGNORECASE)

    for match in range_pattern.finditer(text):
        start = int(match.group("start"))
        end = int(match.group("end"))
        if end >= start:
            # Treat same-year ranges as at least 1 year of experience signal
            spans.append(max(1, end - start))

    for match in present_pattern.finditer(text):
        start = int(match.group("start"))
        if current_year >= start:
            spans.append(current_year - start)

    for match in years_pattern.finditer(text):
        try:
            explicit_years.append(int(match.group(1)))
        except ValueError:
            continue

    if not spans and not explicit_years:
        return None

    max_span = max(spans) if spans else 0
    sum_spans = sum(spans) if spans else 0
    max_explicit = max(explicit_years) if explicit_years else 0

    estimate = max(max_span, sum_spans, max_explicit)
    return estimate if estimate > 0 else None


def estimate_experience_years(text: str) -> Optional[int]:
    """
    Public helper for estimating years of experience from a specific section.

    Kept separate so callers can intentionally scope extraction to the
    EXPERIENCE zone and avoid contamination from EDUCATION year ranges.
    """
    return _estimate_years_experience(text)


def _extract_text_from_pdf(file_path: str) -> str:
    """
    Extract all text from a PDF file.

    Args:
        file_path: Path to the PDF file

    Returns:
        Extracted text as a string
    """
    if not PDFPLUMBER_AVAILABLE:
        raise ImportError("pdfplumber is not installed. Run: pip install pdfplumber")

    text_parts = []

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    return "\n".join(text_parts)


def _extract_text_from_docx(file_path: str) -> str:
    if not DOCX_AVAILABLE:
        raise ImportError("python-docx is not installed. Run: pip install python-docx")

    document = docx.Document(file_path)  # type: ignore[attr-defined]
    parts: list[str] = []
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _find_anchor_position(text: str, anchors: list[str]) -> Optional[int]:
    """
    Find the first occurrence of any anchor in the text.

    Args:
        text: The text to search (should be lowercase)
        anchors: List of anchor keywords to find

    Returns:
        Position of the first anchor found, or None if not found
    """
    positions = []

    for anchor in anchors:
        # Look for anchor as a section header (often on its own line or followed by colon)
        patterns = [
            rf"\n{re.escape(anchor)}\s*[:\n]",  # Newline + anchor + colon/newline
            rf"^{re.escape(anchor)}\s*[:\n]",  # Start of text + anchor
            rf"\n{re.escape(anchor)}\s*$",  # Anchor at end of line
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
            if match:
                positions.append(match.start())
                break

    return min(positions) if positions else None


def _find_next_section_boundary(text: str, start_pos: int, exclude_anchors: list[str]) -> int:
    """
    Find where the next section starts after a given position.

    Args:
        text: The full text (lowercase)
        start_pos: Position to start searching from
        exclude_anchors: Anchors to exclude from boundary detection

    Returns:
        Position of the next section boundary, or end of text
    """
    # Create a set of anchors to look for (excluding current section's anchors)
    boundary_anchors = [a for a in ALL_ANCHORS if a not in exclude_anchors]

    min_boundary = len(text)

    for anchor in boundary_anchors:
        patterns = [
            rf"\n{re.escape(anchor)}\s*[:\n]",
            rf"\n{re.escape(anchor)}\s*$",
        ]

        for pattern in patterns:
            match = re.search(pattern, text[start_pos:], re.MULTILINE | re.IGNORECASE)
            if match:
                boundary = start_pos + match.start()
                if boundary < min_boundary:
                    min_boundary = boundary
                break

    return min_boundary


def _extract_zone(text: str, text_lower: str, anchors: list[str], exclude_from_boundary: list[str]) -> Optional[str]:
    """
    Extract a zone of text starting from an anchor until the next section.

    Args:
        text: Original text (preserves case)
        text_lower: Lowercase version for searching
        anchors: Anchors that mark the start of this zone
        exclude_from_boundary: Anchors to exclude when finding the end boundary

    Returns:
        Extracted zone text, or None if zone not found
    """
    start_pos = _find_anchor_position(text_lower, anchors)

    if start_pos is None:
        return None

    # Find the actual content start (after the anchor line)
    content_start = text_lower.find("\n", start_pos)
    if content_start == -1:
        content_start = start_pos
    else:
        content_start += 1  # Skip the newline

    # Find where this section ends
    end_pos = _find_next_section_boundary(text_lower, content_start, exclude_from_boundary)

    # Extract the zone from original text (preserves case)
    zone_text = text[content_start:end_pos].strip()

    return zone_text if zone_text else None


def _clean_text(text: str) -> str:
    """Clean and normalize extracted text."""
    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    # Remove common artifacts
    text = re.sub(r"•\s*", "- ", text)
    text = re.sub(r"[●○■□◆◇]", "-", text)

    return text.strip()


def extract_skills_from_text(text: str) -> list[str]:
    if not text:
        return []
    text_lower = text.lower()
    found: set[str] = set()

    for key, display in SKILL_LEXICON.items():
        if key in {"c", "c++", "c#"}:
            pattern = r"(?:^|\b)" + re.escape(key) + r"(?:\b|$)"
        else:
            pattern = r"\b" + re.escape(key) + r"\b"
        if re.search(pattern, text_lower):
            found.add(display)

    return sorted(found)


def _extract_candidate_name(text: str) -> Optional[str]:
    """
    Extract a candidate name heuristically from resume text.

    Uses the first non-empty line, strips emails/phones and noisy symbols.
    """
    if not text:
        return None

    for line in text.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue

        # Skip lines that are likely headers without a name
        if "@" in cleaned or "http" in cleaned.lower():
            cleaned = re.sub(r"\S+@\S+", "", cleaned).strip()
        cleaned = re.sub(r"\+?\d[\d\s().-]{7,}", "", cleaned).strip()
        cleaned = re.sub(r"[^A-Za-z\s.'-]", "", cleaned).strip()

        if cleaned and 2 <= len(cleaned) <= 60:
            return cleaned

    return None


def parse_resume_zones(file_path: str) -> dict:
    """
    Parse a resume PDF and extract structured sections using zone detection.

    Uses anchor keywords to identify section boundaries without heavy NLP.

    Args:
        file_path: Path to the PDF resume file

    Returns:
        Dictionary containing:
            - skills_zone: Extracted skills section text (or None)
            - experience_zone: Extracted experience section text (or None)
            - education_zone: Extracted education section text (or None)
            - raw_text: Full resume text for fallback/search
            - zones_found: List of zones that were successfully extracted
            - parsing_success: Boolean indicating if any zones were found

    Example:
        >>> result = parse_resume_zones("/path/to/resume.pdf")
        >>> print(result["skills_zone"])
        "Python, JavaScript, React, Node.js, PostgreSQL..."
    """
    try:
        # Extract raw text from PDF
        raw_text = _extract_text_from_pdf(file_path)
        raw_text = _clean_text(raw_text)

        if not raw_text:
            return {
                "skills_zone": None,
                "experience_zone": None,
                "education_zone": None,
                "raw_text": "",
                "experience_years": None,
                "zones_found": [],
                "parsing_success": False,
                "error": "No text could be extracted from the PDF",
            }

        # Create lowercase version for searching
        text_lower = raw_text.lower()

        # Extract each zone
        skills_zone = _extract_zone(
            raw_text,
            text_lower,
            SKILLS_ANCHORS,
            exclude_from_boundary=SKILLS_ANCHORS,
        )

        experience_zone = _extract_zone(
            raw_text,
            text_lower,
            EXPERIENCE_ANCHORS,
            exclude_from_boundary=EXPERIENCE_ANCHORS,
        )

        education_zone = _extract_zone(
            raw_text,
            text_lower,
            EDUCATION_ANCHORS,
            exclude_from_boundary=EDUCATION_ANCHORS,
        )

        # Track which zones were found
        zones_found = []
        if skills_zone:
            zones_found.append("skills")
        if experience_zone:
            zones_found.append("experience")
        if education_zone:
            zones_found.append("education")

        # Scope experience estimation to the experience section to avoid
        # counting education ranges (e.g., 2021-2025) as work years.
        experience_years = _estimate_years_experience(experience_zone or "")

        return {
            "skills_zone": skills_zone,
            "experience_zone": experience_zone,
            "education_zone": education_zone,
            "raw_text": raw_text,
            "experience_years": experience_years,
            "zones_found": zones_found,
            "parsing_success": len(zones_found) > 0,
            "name": _extract_candidate_name(raw_text),
        }

    except FileNotFoundError:
        return {
            "skills_zone": None,
            "experience_zone": None,
            "education_zone": None,
            "raw_text": "",
            "experience_years": None,
            "zones_found": [],
            "parsing_success": False,
            "error": f"File not found: {file_path}",
        }

    except Exception as e:
        return {
            "skills_zone": None,
            "experience_zone": None,
            "education_zone": None,
            "raw_text": "",
            "experience_years": None,
            "zones_found": [],
            "parsing_success": False,
            "error": f"Error parsing PDF: {str(e)}",
        }


def parse_resume_text(text: str) -> dict:
    """
    Parse resume from raw text (useful for testing or non-PDF sources).

    Args:
        text: Raw resume text

    Returns:
        Same dictionary structure as parse_resume_zones
    """
    raw_text = _clean_text(text)

    if not raw_text:
        return {
            "skills_zone": None,
            "experience_zone": None,
            "education_zone": None,
            "raw_text": "",
            "experience_years": None,
            "zones_found": [],
            "parsing_success": False,
            "error": "No text provided",
        }

    text_lower = raw_text.lower()

    skills_zone = _extract_zone(
        raw_text,
        text_lower,
        SKILLS_ANCHORS,
        exclude_from_boundary=SKILLS_ANCHORS,
    )

    experience_zone = _extract_zone(
        raw_text,
        text_lower,
        EXPERIENCE_ANCHORS,
        exclude_from_boundary=EXPERIENCE_ANCHORS,
    )

    education_zone = _extract_zone(
        raw_text,
        text_lower,
        EDUCATION_ANCHORS,
        exclude_from_boundary=EDUCATION_ANCHORS,
    )

    zones_found = []
    if skills_zone:
        zones_found.append("skills")
    if experience_zone:
        zones_found.append("experience")
    if education_zone:
        zones_found.append("education")

    experience_years = _estimate_years_experience(experience_zone or "")

    return {
        "skills_zone": skills_zone,
        "experience_zone": experience_zone,
        "education_zone": education_zone,
        "raw_text": raw_text,
        "experience_years": experience_years,
        "zones_found": zones_found,
        "parsing_success": len(zones_found) > 0,
        "name": _extract_candidate_name(raw_text),
    }


def parse_resume_docx(file_path: str) -> dict:
    try:
        raw_text = _extract_text_from_docx(file_path)
        return parse_resume_text(raw_text)
    except Exception as e:
        return {
            "skills_zone": None,
            "experience_zone": None,
            "education_zone": None,
            "raw_text": "",
            "experience_years": None,
            "zones_found": [],
            "parsing_success": False,
            "error": f"Error parsing DOCX: {str(e)}",
        }


def extract_skills_list(skills_text: str) -> list[str]:
    """
    Extract individual skills from skills zone text.

    Args:
        skills_text: Raw skills section text

    Returns:
        List of individual skill strings
    """
    if not skills_text:
        return []

    # Common separators in skills sections
    # Split by commas, bullets, pipes, semicolons, newlines
    skills = re.split(r"[,;|•\-\n]+", skills_text)

    # Clean each skill
    cleaned_skills = []
    for skill in skills:
        skill = skill.strip()
        # Remove common prefixes/suffixes
        skill = re.sub(r"^\d+[.)\s]+", "", skill)  # Remove numbering
        skill = skill.strip("- •○●")

        # Only keep if it looks like a valid skill (not too long, not empty)
        if skill and len(skill) < 50 and len(skill) > 1:
            cleaned_skills.append(skill)

    return cleaned_skills
