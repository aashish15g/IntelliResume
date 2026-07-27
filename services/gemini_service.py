from google import genai
from google.genai import types
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List
from pydantic import ValidationError
from pydantic import Field


load_dotenv()

client = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))

class ResumeFeedback(BaseModel):
    summary: str = Field(
        description=(
            "A warm, conversational 2-3 sentence overview of the resume, "
            "written like a supportive mentor talking directly to the person "
            "(use 'you'/'your'). Not a list, not corporate-sounding — just a "
            "natural opening reaction to their resume."
        )
    )
    score: int = Field(description="Overall fit for the role, 0-100.")
    strengths: List[str]
    skill_gaps: List[str]
    suggestions: List[str]

def BuildPrompt(resume_text: str, job_title: str) -> str:
    return f"""You are a supportive, experienced career coach — the kind of mentor who's
    encouraging but honest, not a corporate HR bot. Write like you're actually
    talking to this person, not filling out a form.

    Analyze the following resume for someone applying to a "{job_title}" role.

    Resume:
    ---
    {resume_text}
    ---

    Write each point in a natural, conversational tone — like ChatGPT would talk
    to someone, not like a checklist. Use "you" and "your" directly. Be specific
    and encouraging, not generic. For example, instead of "Lacks cloud experience,"
    write something like "You haven't listed any cloud platform experience (AWS,
    Azure, GCP) — that's worth adding if you've touched any of them, even briefly."

    Evaluate:
    - Overall strength of the resume for this specific role (score 0-100)
    - Key strengths relevant to the role
    - Skill or experience gaps relative to a typical "{job_title}" job posting
    - Specific, actionable suggestions to improve the resume for this role
    """
 
   

def get_resume_feedback(resume_text: str, job_title: str) -> dict:
    prompt = BuildPrompt(resume_text, job_title)
    try:
        response = client.models.generate_content(
        model = 'gemini-3.1-flash-lite',
        contents = prompt,
        config = types.GenerateContentConfig(
            temperature = 0,
            response_mime_type='application/json',
            response_json_schema=ResumeFeedback.model_json_schema(),
            ),
        )
    except Exception as e:
        return {"error": f"Gemini request failed: {e}"}
    
    try:
        feedback = ResumeFeedback.model_validate_json(response.text)

    except ValidationError as e:
        return {'error': f'The response was not in the proper format: {e}'}
    
    return feedback.model_dump()

def user_followup(resume_text: str, job_title: str, message_history: list, question: str) -> str:
    chat = client.chats.create(
        model='gemini-3.5-flash',
        config = types.GenerateContentConfig(
            system_instruction=(
                "You are a helpful, friendly resume advisor. Speak naturally, "
                "like a knowledgeable friend giving career advice — not a form "
                "or a report. Here is the user's resume:\n\n"
                f"{resume_text}\n\n"
                f"They are targeting a '{job_title}' role. Answer their questions "
                "directly, suggest specific wording changes when asked, and "
                "recommend skills to learn when relevant."
            ),
        ),
        history=[
            types.Content(role=m.role, parts=[types.Part.from_text(text=m.content)])
            for m in message_history
        ],
    )
 
    try:
        response = chat.send_message(question)
        return response.text
    except Exception as e:
        return f"Sorry, I couldn't process that question: {e}"
    




if __name__ == "__main__":
    # Quick manual test — run this file directly to check the pipeline
    # without needing Flask running at all.
    sample_resume = """
    Aashish Ganeshkumar
    Computer Science Engineering student.
    Skills: Python, Java, C++, SQL, Flask, LangChain.
    Experience: Built a RAG chatbot using Gemini and FAISS.
    """
    result = get_resume_feedback(sample_resume, "Software Engineer")
 
    import json
    print(json.dumps(result, indent=2))
 
    # Quick manual test of the follow-up chat, using a fake in-memory
    # message history (normally this comes from your Message DB rows).
    '''class FakeMessage:
        def __init__(self, role, content):
            self.role = role
            self.content = content
 
    history = []
    answer1 = user_followup(sample_resume, "Software Engineer", history, "What wording should I change?")
    print("\n--- Follow-up 1 ---")
    print(answer1)
 
    history.append(FakeMessage("user", "What wording should I change?"))
    history.append(FakeMessage("model", answer1))
 
    answer2 = user_followup(sample_resume, "Software Engineer", history, "What skills should I learn next?")
    print("\n--- Follow-up 2 ---")
    print(answer2)'''






















