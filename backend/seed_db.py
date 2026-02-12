"""
AeroHire Database Seeder

Creates test users and a finished candidate (John Doe) with:
- Completed assessment
- Mock code_history (showing code evolution)
- Mock char_breakdown (typed vs pasted)
"""

import sys
sys.path.insert(0, ".")

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.user import User
from app.models.candidate import Candidate
from app.models.assessment import CodeSubmission
from app.core.security import get_password_hash


def seed_database():
    """Seed the database with test data."""

    # Create all tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        # Check if already seeded
        existing_recruiter = db.query(User).filter(User.email == "recruiter@aerohire.com").first()
        if existing_recruiter:
            print("Database already seeded. Skipping...")
            return

        print("Seeding database...")

        # 1. Create Recruiter User
        recruiter = User(
            email="recruiter@aerohire.com",
            hashed_password=get_password_hash("recruiter123"),
            full_name="Sarah Chen",
            role="recruiter"
        )
        db.add(recruiter)

        # 2. Create Candidate User - John Doe (Finished Assessment)
        john_user = User(
            email="john.doe@example.com",
            hashed_password=get_password_hash("candidate123"),
            full_name="John Doe",
            role="candidate"
        )
        db.add(john_user)
        db.flush()  # Get IDs

        # 3. Create John Doe's Candidate Profile (Completed)
        john_candidate = Candidate(
            user_id=john_user.id,
            resume_parsed_data={
                "skills": ["Python", "React", "FastAPI", "Docker"],
                "experience_years": 4,
                "education": "B.S. Computer Science, MIT"
            },
            resume_text_raw="John Doe - Senior Software Engineer with 4 years experience...",
            technical_score=85,
            psychometric_score=78,
            ai_rationale="Strong technical skills demonstrated through clean code architecture. "
                         "Shows excellent problem-solving approach with 85% test pass rate. "
                         "Psychometric analysis indicates good teamwork orientation (78/100). "
                         "Code playback shows methodical development process with minimal paste-ins.",
            hiring_recommendation="HIRE",
            confidence_score=92,
            status="Completed"
        )
        db.add(john_candidate)
        db.flush()

        # 4. Create John Doe's Code Submission with Innovation Trinity Data
        john_submission = CodeSubmission(
            candidate_id=john_candidate.id,
            question_id=1,
            submitted_code="""def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []""",
            is_passed=True,
            tests_passed=5,
            tests_total=5,
            execution_time_ms=12.5,
            memory_usage_mb=2.1,
            error_log=None,

            # Innovation Trinity: Code Playback History
            # Shows code evolution every 5 seconds
            code_history=[
                {
                    "timestamp": 1706800000000,
                    "code": "def two_sum(nums, target):\n    pass"
                },
                {
                    "timestamp": 1706800005000,
                    "code": "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):"
                },
                {
                    "timestamp": 1706800010000,
                    "code": "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:"
                },
                {
                    "timestamp": 1706800015000,
                    "code": "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []"
                }
            ],

            # Innovation Trinity: Paste Forensics
            # 50 typed, 10 pasted (83% authentic)
            char_breakdown={"typed": 50, "pasted": 10},

            # Innovation Trinity: Teammate Chat
            chat_response="Hey Alex! Great question about the hash map approach. "
                          "I chose it because it gives us O(n) time complexity instead of O(n²) "
                          "with nested loops. The trade-off is O(n) space, but for most cases "
                          "that's worth it. Want me to walk through an example?",
            teamwork_score=85
        )
        db.add(john_submission)

        # 5. Create another candidate (Jane Smith - In Progress)
        jane_user = User(
            email="jane.smith@example.com",
            hashed_password=get_password_hash("candidate123"),
            full_name="Jane Smith",
            role="candidate"
        )
        db.add(jane_user)
        db.flush()

        jane_candidate = Candidate(
            user_id=jane_user.id,
            resume_parsed_data={
                "skills": ["JavaScript", "Node.js", "AWS"],
                "experience_years": 2,
                "education": "B.S. Software Engineering, Stanford"
            },
            resume_text_raw="Jane Smith - Full Stack Developer...",
            technical_score=0,
            psychometric_score=0,
            status="Assessment_Started"
        )
        db.add(jane_candidate)

        # Commit all changes
        db.commit()

        print("✅ Database seeded successfully!")
        print("\n📋 Created Users:")
        print("   - recruiter@aerohire.com (password: recruiter123)")
        print("   - john.doe@example.com (password: candidate123) [COMPLETED]")
        print("   - jane.smith@example.com (password: candidate123) [IN PROGRESS]")
        print("\n🎯 John Doe has:")
        print("   - Technical Score: 85/100")
        print("   - Psychometric Score: 78/100")
        print("   - Code History: 4 snapshots")
        print("   - Char Breakdown: 50 typed, 10 pasted (83% authentic)")
        print("   - Recommendation: HIRE (92% confidence)")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
