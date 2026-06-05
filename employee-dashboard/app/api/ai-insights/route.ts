import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function POST(req: Request) {

  try {

    const body = await req.json();

    const {
      employee_name,
      productiveTime,
      distractingTime,
      idleTime,
      productivityPercent,
      focusSessions,
      topApp,
      topWebsite
    } = body;

    // ============================================
    // AI PROMPT
    // ============================================

    const prompt = `

You are an AI workforce productivity analyst.

Analyze the following employee analytics
and generate a professional productivity summary.

Employee: ${employee_name}

Productive Time: ${Math.floor(productiveTime/3600)}h ${Math.floor((productiveTime%3600)/60)}m

Distracting Time: ${Math.floor(distractingTime/3600)}h ${Math.floor((distractingTime%3600)/60)}m

Idle Time: ${Math.floor(idleTime/3600)}h ${Math.floor((idleTime%3600)/60)}m

Focus Sessions: ${focusSessions}

Productivity Percentage: ${productivityPercent}%

Top App: ${topApp}

Top Website: ${topWebsite}

Generate:
1. Productivity summary
2. Behavioral insights
3. Improvement suggestions

Keep it concise and professional.

`;

    // ============================================
    // GROQ API
    // ============================================

    const completion =
      await groq.chat.completions.create({

        messages: [
          {
            role: "user",
            content: prompt
          }
        ],

        model: "llama-3.3-70b-versatile"
      });

    const insight =
      completion.choices[0]
      .message.content;

    return Response.json({
      insight
    });

  } catch (error: any) {

    console.log(error);

    return Response.json({
      error: "AI generation failed: " + (error.message || error.toString())
    }, { status: 500 });
  }
}
