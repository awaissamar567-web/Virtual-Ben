import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Helper to query the USDA API and extract simplified macros
async function searchUSDANutrition(queryText: string) {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) return "Error: USDA API key not configured.";

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(queryText)}&pageSize=3`,
      { method: "GET" }
    );
    if (!response.ok) return "Error: Failed to retrieve data from USDA API.";
    
    const data = await response.json();
    if (!data.foods || data.foods.length === 0) {
      return `No USDA results found for query: "${queryText}".`;
    }

    const formatted = data.foods.map((food: any) => {
      const nutrients = food.foodNutrients || [];
      const getVal = (name: string) => {
        const item = nutrients.find((n: any) => n.nutrientName.toLowerCase().includes(name.toLowerCase()));
        return item ? `${item.value} ${item.unitName}` : "0 g";
      };
      return {
        name: food.description,
        brand: food.brandOwner || "Generic/Raw",
        servingSize: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit}` : "100g basis",
        calories: getVal("Energy"),
        protein: getVal("Protein"),
        fat: getVal("Total lipid"),
        carbs: getVal("Carbohydrate"),
      };
    });

    return JSON.stringify(formatted, null, 2);
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// Helper to query wger exercise API by muscle name (kept for backwards compatibility)
async function getWgerExercisesByMuscleName(muscleName: string) {
  const muscleMap: Record<string, number> = {
    biceps: 1,
    arms: 1,
    shoulders: 2,
    deltoids: 2,
    chest: 4,
    pecs: 4,
    triceps: 8,
    quadriceps: 10,
    quads: 10,
    legs: 10,
    abs: 11,
    abdominals: 11,
    core: 11,
  };

  const normalized = muscleName.toLowerCase().trim();
  const muscleId = muscleMap[normalized];

  if (!muscleId) {
    return `Error: Muscle name "${muscleName}" not recognized in database map. Please specify biceps, shoulders, chest, triceps, quads, or abs.`;
  }

  try {
    const response = await fetch(
      `https://wger.de/api/v2/exerciseinfo/?format=json&muscles=${muscleId}&language=2&limit=15`,
      { method: "GET" }
    );
    if (!response.ok) return "Error: Failed to retrieve exercises from wger API.";

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return `No wger exercises found for muscle group ID: ${muscleId}`;
    }

    const formatted = data.results.map((ex: any) => {
      const translation = ex.translations.find((t: any) => t.language === 2) || ex.translations[0];
      return {
        id: ex.id,
        name: translation?.name || ex.name || "Unnamed Exercise",
        description: translation?.description ? translation.description.replace(/<[^>]*>/g, "").trim() : "No instruction details available."
      };
    });

    return JSON.stringify(formatted, null, 2);
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// 1. Fetch Categories
async function getWgerCategories() {
  try {
    const response = await fetch("https://wger.de/api/v2/exercisecategory/?format=json");
    if (!response.ok) return `Error: Failed to retrieve categories (status ${response.status}).`;
    const data = await response.json();
    return JSON.stringify(data.results.map((x: any) => ({ id: x.id, name: x.name })), null, 2);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

// 2. Fetch Muscles
async function getWgerMuscles() {
  try {
    const response = await fetch("https://wger.de/api/v2/muscle/?format=json");
    if (!response.ok) return `Error: Failed to retrieve muscles (status ${response.status}).`;
    const data = await response.json();
    return JSON.stringify(data.results.map((x: any) => ({ id: x.id, name: x.name, name_en: x.name_en })), null, 2);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

// 3. Fetch Equipment
async function getWgerEquipment() {
  try {
    const response = await fetch("https://wger.de/api/v2/equipment/?format=json");
    if (!response.ok) return `Error: Failed to retrieve equipment (status ${response.status}).`;
    const data = await response.json();
    return JSON.stringify(data.results.map((x: any) => ({ id: x.id, name: x.name })), null, 2);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

// 4. Fetch Exercises with full query filters
async function queryWgerExercises(options: {
  muscles?: string;
  category?: number;
  equipment?: string;
  limit?: number;
  term?: string;
}) {
  const { muscles, category, equipment, limit = 30, term } = options;
  let url = `https://wger.de/api/v2/exerciseinfo/?format=json&language=2&limit=${Math.min(limit, 100)}`;
  
  if (muscles) url += `&muscles=${encodeURIComponent(muscles)}`;
  if (category) url += `&category=${encodeURIComponent(category.toString())}`;
  if (equipment) url += `&equipment=${encodeURIComponent(equipment)}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return `Error: Failed to retrieve exercises (status ${response.status}).`;

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return "No wger exercises found matching the criteria.";
    }

    let results = data.results.map((ex: any) => {
      const translation = ex.translations.find((t: any) => t.language === 2) || ex.translations[0];
      const name = translation?.name || ex.name || "Unnamed Exercise";
      const description = translation?.description 
        ? translation.description.replace(/<[^>]*>/g, "").trim() 
        : "No instruction details available.";
      
      return {
        id: ex.id,
        name,
        category: ex.category?.name || "Other",
        muscles: ex.muscles?.map((m: any) => m.name_en || m.name) || [],
        equipment: ex.equipment?.map((eq: any) => eq.name) || [],
        description
      };
    });

    if (term) {
      const normalizedTerm = term.toLowerCase().trim();
      results = results.filter((ex: any) => 
        ex.name.toLowerCase().includes(normalizedTerm) || 
        ex.description.toLowerCase().includes(normalizedTerm) ||
        ex.category.toLowerCase().includes(normalizedTerm)
      );
      if (results.length === 0) {
        return `No wger exercises found matching search term: "${term}".`;
      }
    }

    return JSON.stringify(results.slice(0, 20), null, 2);
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// 5. Get User Routines (Requires token)
async function getWgerUserRoutines(wgerToken?: string) {
  if (!wgerToken || !wgerToken.trim()) {
    return "Error: wger API token is missing. Please configure it in your settings card in the bottom-left sidebar.";
  }
  try {
    const response = await fetch("https://wger.de/api/v2/routine/?format=json", {
      method: "GET",
      headers: {
        "Authorization": `Token ${wgerToken.trim()}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      return `Error: Failed to fetch routines. Check if your API token is correct. (Status ${response.status})`;
    }
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return "You don't have any workout routines created in your wger account yet.";
    }
    return JSON.stringify(data.results.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || "No description provided.",
      created: r.created
    })), null, 2);
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// 6. Create User Routine (Requires token)
async function createWgerUserRoutine(name: string, description: string | undefined, wgerToken?: string) {
  if (!wgerToken || !wgerToken.trim()) {
    return "Error: wger API token is missing. Please configure it in your settings.";
  }
  try {
    const response = await fetch("https://wger.de/api/v2/routine/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${wgerToken.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        description: description || ""
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      return `Error: Failed to create routine. wger API returned: ${response.status} - ${errText}`;
    }
    const data = await response.json();
    return `Success! Routine "${data.name}" was successfully created in your wger account with ID: ${data.id}.`;
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// 7. Log Workout Session (Requires token)
async function logWgerWorkoutSession(
  date: string | undefined,
  notes: string | undefined,
  logs: Array<{ exercise_id: number; reps: number; weight: number }>,
  wgerToken?: string
) {
  if (!wgerToken || !wgerToken.trim()) {
    return "Error: wger API token is missing. Please configure it in your settings.";
  }

  try {
    // A. Create workout session container
    const sessionRes = await fetch("https://wger.de/api/v2/workoutsession/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${wgerToken.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: date || new Date().toISOString().split("T")[0],
        notes: notes || "Logged via Virtual Ben AI Coach"
      })
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      return `Error: Failed to create workout session. wger API returned: ${sessionRes.status} - ${errText}`;
    }

    const sessionData = await sessionRes.json();
    const sessionId = sessionData.id;

    // B. Post set logs
    const results = [];
    for (const entry of logs) {
      const logRes = await fetch("https://wger.de/api/v2/workoutlog/", {
        method: "POST",
        headers: {
          "Authorization": `Token ${wgerToken.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workout_session: sessionId,
          exercise: entry.exercise_id,
          reps: entry.reps,
          weight: entry.weight
        })
      });

      if (logRes.ok) {
        results.push(`Successfully logged Exercise ID ${entry.exercise_id}: ${entry.reps} reps @ ${entry.weight}kg`);
      } else {
        const errText = await logRes.text();
        results.push(`Failed to log Exercise ID ${entry.exercise_id}: ${logRes.status} - ${errText}`);
      }
    }

    return `Success! Workout Session ID ${sessionId} created on ${sessionData.date}.\nLog Results:\n- ${results.join("\n- ")}`;
  } catch (err: any) {
    return `Error logging workout: ${err.message}`;
  }
}

// Helper to read the optimized reference manual summary
function getSystemReferenceInstructions() {
  try {
    const filePath = path.join(process.cwd(), "src/app/api/chat/instructions_summary.md");
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    console.error("Error reading instructions file:", err);
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const wgerToken = process.env.WGER_API_KEY;
    const apiKey = process.env.GROQ_API_KEY;

    // Sanitize message history to remove any accidental or hallucinated function-call strings from previous turns
    const sanitizedMessages = messages.map((m: any) => {
      if (m && typeof m.content === "string") {
        let content = m.content;
        if (content.includes("<function=") || content.includes("</function>")) {
          // Replace or strip XML-style function calls to prevent Groq syntax/validation errors
          content = content.replace(/<function=[\s\S]*?<\/function>/g, "");
          content = content.replace(/<function=[\s\S]*/g, ""); // strip unclosed tags
        }
        return { ...m, content };
      }
      return m;
    });

    // Ground the AI model with the wger & USDA complete reference manual
    const referenceManual = getSystemReferenceInstructions();
    if (sanitizedMessages[0]?.role === "system") {
      let content = sanitizedMessages[0].content || "";
      if (referenceManual) {
        content += "\n\n### COMPLETE WGER & USDA REFERENCE MANUAL INSTRUCTIONS:\n" + referenceManual;
      }
      // Add a strict instruction to prevent XML-based function calling hallucinations
      content += "\n\n### CRITICAL SYSTEM INSTRUCTION FOR FUNCTION CALLS / TOOL USE:\n" +
        "You have access to tools/functions (like search_usda_nutrition, queryWgerExercises, etc.).\n" +
        "1. DO NOT write or output XML tags like '<function=...></function>' or '<function=...' in your response text under any circumstances.\n" +
        "2. Do NOT try to write tool calls as plain text or code blocks in your response.\n" +
        "3. You must ONLY call tools using the API's native JSON tool calling mechanism. The model runner will automatically parse it and call the function.\n" +
        "4. If you output '<function=' or write XML function calls in your text, it will trigger an immediate system crash. Keep your text response clean, direct, and free of custom tags.";
      sanitizedMessages[0].content = content;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Groq API key not configured on the server." },
        { status: 500 }
      );
    }

    // Define tools
    const tools = [
      {
        type: "function",
        function: {
          name: "search_usda_nutrition",
          description: "Searches the official USDA database for accurate scientific calorie, protein, carb, and fat values for specific whole foods or branded grocery items.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The name of the food or grocery item (e.g. 'avocado', 'pasture-raised eggs', 'jasmine rice')"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_exercises_by_muscle",
          description: "Queries the wger database to fetch actual exercises and instructions for a specific target muscle group by muscle name (e.g. 'biceps', 'chest').",
          parameters: {
            type: "object",
            properties: {
              muscle: {
                type: "string",
                description: "The name of the target muscle (e.g. 'chest', 'biceps', 'triceps', 'shoulders', 'quads', 'abs')"
              }
            },
            required: ["muscle"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_get_exercise_categories",
          description: "Fetches all available exercise category names and their corresponding IDs from the wger database (e.g. Chest: 11, Legs: 9).",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_get_muscle_groups",
          description: "Fetches all available muscle group names and their corresponding IDs from the wger database (e.g. Biceps: 1, Chest: 4).",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_get_equipment_list",
          description: "Fetches all available gym equipment names and their corresponding IDs from the wger database (e.g. Barbell: 1, Dumbbell: 3).",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_get_exercises",
          description: "Retrieves exercises from the wger database. Filters by comma-separated muscle group IDs, category ID, and equipment IDs, and supports in-memory text filtering.",
          parameters: {
            type: "object",
            properties: {
              muscles: {
                type: "string",
                description: "Comma-separated muscle group IDs (e.g. '1' for Biceps, '4' for Chest, or '1,4'). Use wger_get_muscle_groups to find IDs."
              },
              category: {
                type: "integer",
                description: "Category ID (e.g. 11 for Chest). Use wger_get_exercise_categories to find IDs."
              },
              equipment: {
                type: "string",
                description: "Comma-separated equipment IDs (e.g. '1' for Barbell, '3' for Dumbbell). Use wger_get_equipment_list to find IDs."
              },
              limit: {
                type: "integer",
                description: "Max number of exercises to retrieve (default 30, max 100)."
              },
              term: {
                type: "string",
                description: "Search keyword term to filter exercise names or descriptions in memory (e.g. 'Press', 'Squat', 'Push-Up')."
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_get_user_routines",
          description: "Lists all workout routines saved in the user's personal wger.de account. Requires an authenticated wger API token.",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_create_user_routine",
          description: "Creates a new workout routine shell in the user's personal wger.de account. Requires an authenticated wger API token.",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name of the routine (e.g. 'Push Pull Legs Split', '5x5 Strength Routine')."
              },
              description: {
                type: "string",
                description: "Optional notes or details about the workout routine."
              }
            },
            required: ["name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "wger_log_workout_session",
          description: "Logs a completed workout session (with date, optional notes, and performed exercises/sets/reps/weights) directly to the user's personal wger.de account. Requires an authenticated wger API token.",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Date of the workout in YYYY-MM-DD format. Default is today's local date."
              },
              notes: {
                type: "string",
                description: "Optional general notes about the workout session (e.g. 'Felt strong today', 'Leg day focus')."
              },
              logs: {
                type: "array",
                description: "List of performed sets/exercises to log.",
                items: {
                  type: "object",
                  properties: {
                    exercise_id: {
                      type: "integer",
                      description: "The wger database exercise ID (e.g. 1964). Use wger_get_exercises to find IDs."
                    },
                    reps: {
                      type: "integer",
                      description: "Number of repetitions performed in this set."
                    },
                    weight: {
                      type: "number",
                      description: "Weight lifted in kg (e.g. 80.5)."
                    }
                  },
                  required: ["exercise_id", "reps", "weight"]
                }
              }
            },
            required: ["logs"]
          }
        }
      }
    ];

    // 1. Initial non-streaming call to check for tool requests
    const initialResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: sanitizedMessages,
        temperature: 0.7,
        max_tokens: 4096,
        tools,
        tool_choice: "auto",
        stream: false,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("GROQ API ERROR:", initialResponse.status, errorText);
      console.log("Messages count:", sanitizedMessages.length);
      console.log("Messages total payload size:", JSON.stringify(sanitizedMessages).length);
      return NextResponse.json(
        { error: `Groq initial API error: ${errorText}` },
        { status: initialResponse.status }
      );
    }

    const data = await initialResponse.json();
    const message = data.choices?.[0]?.message;

    // 2. Resolve tool calls sequentially if the model requests them
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCalls = message.tool_calls;
      const updatedMessages = [...sanitizedMessages, message];

      for (const toolCall of toolCalls) {
        let searchResult = "";
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === "search_usda_nutrition") {
          searchResult = await searchUSDANutrition(args.query);
        } else if (toolCall.function.name === "get_exercises_by_muscle") {
          searchResult = await getWgerExercisesByMuscleName(args.muscle);
        } else if (toolCall.function.name === "wger_get_exercise_categories") {
          searchResult = await getWgerCategories();
        } else if (toolCall.function.name === "wger_get_muscle_groups") {
          searchResult = await getWgerMuscles();
        } else if (toolCall.function.name === "wger_get_equipment_list") {
          searchResult = await getWgerEquipment();
        } else if (toolCall.function.name === "wger_get_exercises") {
          searchResult = await queryWgerExercises(args);
        } else if (toolCall.function.name === "wger_get_user_routines") {
          searchResult = await getWgerUserRoutines(wgerToken);
        } else if (toolCall.function.name === "wger_create_user_routine") {
          searchResult = await createWgerUserRoutine(args.name, args.description, wgerToken);
        } else if (toolCall.function.name === "wger_log_workout_session") {
          searchResult = await logWgerWorkoutSession(args.date, args.notes, args.logs, wgerToken);
        }

        updatedMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: searchResult,
        });
      }

      // Fetch final completion from Groq streaming the result back to typewriter
      const finalResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: updatedMessages,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }),
      });

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        return NextResponse.json(
          { error: `Groq final API error: ${errorText}` },
          { status: finalResponse.status }
        );
      }

      return new Response(finalResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // 3. Fallback: stream standard completion
    const text = message?.content || "";
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const data = {
          choices: [
            {
              delta: {
                content: text,
              },
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
