import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# =====================================================
# GROQ CLIENT
# =====================================================

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

# =====================================================
# SAMPLE ANALYTICS
# =====================================================

employee_name = "Alvin"

productive_time = "5h 12m"

distracting_time = "42m"

idle_time = "20m"

focus_sessions = 6

productivity_percent = 82

top_app = "VS Code"

top_website = "github.com"

# =====================================================
# AI PROMPT
# =====================================================

prompt = f"""

You are an AI workforce productivity analyst.

Analyze the following employee analytics
and generate a professional productivity summary.

Employee: {employee_name}

Productive Time: {productive_time}

Distracting Time: {distracting_time}

Idle Time: {idle_time}

Focus Sessions: {focus_sessions}

Productivity Percentage: {productivity_percent}%

Top App: {top_app}

Top Website: {top_website}

Generate:
1. Productivity summary
2. Behavioral insights
3. Improvement suggestions

Keep it concise and professional.

"""

# =====================================================
# GENERATE AI RESPONSE
# =====================================================

response = client.chat.completions.create(

    model="llama-3.3-70b-versatile",

    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ]
)

# =====================================================
# OUTPUT
# =====================================================

insight = response.choices[0].message.content

print("\n===================================")

print("AI PRODUCTIVITY INSIGHT")

print("===================================\n")

print(insight)

print("\n===================================\n")
