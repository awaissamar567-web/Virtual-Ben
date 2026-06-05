# SECTION 1: WGER WORKOUT MANAGER API — COMPLETE REFERENCE

## Base URL
`https://wger.de/api/v2/`

## Endpoints Reference

| Endpoint | Method | Parameters | Description |
| :--- | :--- | :--- | :--- |
| `/exercise/` | GET | `muscle`, `equipment`, `category`, `language` | List all exercises with filters. |
| `/exerciseinfo/` | GET | `id` | Detailed info for a specific exercise. |
| `/muscle/` | GET | None | List all muscle groups. |
| `/exercisecategory/` | GET | None | List all exercise categories. |
| `/equipment/` | GET | None | List all equipment types. |
| `/routine/` | GET/POST | `name`, `description` | Manage workout routines. |
| `/day/` | GET/POST | `routine`, `day` | Manage days within a routine. |
| `/slot/` | GET/POST | `day` | Manage exercise slots in a day. |
| `/slotconfig/` | GET/POST | `slot`, `exercise` | Configure exercise in a slot. |
| `/workoutlog/` | GET/POST | `date`, `comment` | Log a workout session. |

## IDs Reference

### Muscle Groups
| ID | Name | Name (EN) |
| :--- | :--- | :--- |
| 2 | Anterior deltoid | Shoulders |
| 1 | Biceps brachii | Biceps |
| 11 | Biceps femoris | Hamstrings |
| 13 | Brachialis | |
| 7 | Gastrocnemius | Calves |
| 8 | Gluteus maximus | Glutes |
| 12 | Latissimus dorsi | Lats |
| 4 | Pectoralis major | Chest |
| 10 | Quadriceps femoris | Quads |
| 6 | Rectus abdominis | Abs |
| 9 | Trapezius | |
| 5 | Triceps brachii | Triceps |

### Exercise Categories
| ID | Name |
| :--- | :--- |
| 10 | Abs |
| 8 | Arms |
| 12 | Back |
| 14 | Calves |
| 15 | Cardio |
| 11 | Chest |
| 9 | Legs |
| 13 | Shoulders |

### Equipment
| ID | Name |
| :--- | :--- |
| 1 | Barbell |
| 8 | Bench |
| 3 | Dumbbell |
| 4 | Gym mat |
| 9 | Incline bench |
| 10 | Kettlebell |
| 6 | Pull-up bar |
| 11 | Resistance band |
| 2 | SZ-Bar |
| 5 | Swiss Ball |
| 7 | none (bodyweight) |

## Authentication
- **Method:** Token Authentication.
- **Header:** `Authorization: Token <YOUR_API_KEY>`
- **How to Generate:** Register at `wger.de`, go to user profile -> API Key.
- **Public vs Private:** Public endpoints (exercises, muscles, etc.) do not require auth. Private endpoints (routines, logs, profile) require Token auth.

## Rate Limits
- No explicit public rate limit stated, but standard REST practices apply (approx. 1000 requests per hour recommended).

## Filtering Exercises
- **By Muscle:** `?muscles=1` (Biceps)
- **By Category:** `?category=10` (Abs)
- **By Equipment:** `?equipment=3` (Dumbbell)
- **By Language:** `?language=2` (English)

## Implementation Code

### JavaScript Fetch
```javascript
const fetchExercises = async () => {
  const response = await fetch('https://wger.de/api/v2/exercise/?language=2', {
    headers: { 'Authorization': 'Token YOUR_API_KEY' }
  });
  const data = await response.json();
  return data.results;
};
```

### Python Requests
```python
import requests

def get_exercises(api_key):
    headers = {'Authorization': f'Token {api_key}'}
    url = 'https://wger.de/api/v2/exercise/?language=2'
    response = requests.get(url, headers=headers)
    return response.json()['results']
```

## Sample JSON Response (Exercise)
```json
{
    "id": 345,
    "name": "Bench Press",
    "description": "Standard barbell bench press...",
    "category": 11,
    "muscles": [4],
    "equipment": [1, 8]
}
```

## Error Codes
- `200 OK`: Success.
- `201 Created`: Resource created.
- `401 Unauthorized`: Invalid or missing token.
- `403 Forbidden`: Permission denied.
- `404 Not Found`: Resource does not exist.
- `429 Too Many Requests`: Rate limit exceeded.
# SECTION 2: USDA FOODDATA CENTRAL API — COMPLETE REFERENCE

## Base URL
`https://api.nal.usda.gov/fdc/v1/`

## Endpoints Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/food/{fdcId}` | GET | Details for one food item by FDC ID. |
| `/foods` | GET/POST | Details for multiple foods by IDs. |
| `/foods/list` | GET/POST | Paged list of foods in abridged format. |
| `/foods/search` | GET/POST | Search for foods matching keywords. |

## Getting API Key
1. Go to `https://fdc.nal.usda.gov/api-guide.html`.
2. Click "Sign up to obtain a key".
3. Enter name, email, and application URL.
4. Key is sent via email and is active immediately.

## Search Parameters (GET `/foods/search`)
- `query`: Keywords (e.g., "Cheddar Cheese").
- `dataType`: Array of strings (Foundation, SR Legacy, Branded, Survey).
- `pageSize`: Number of results per page (default 50).
- `pageNumber`: Page number.
- `sortBy`: Field to sort by (e.g., `lowercaseDescription.keyword`).
- `sortOrder`: `asc` or `desc`.

## Food Categories
- **Foundation:** Heavily analyzed, high-quality data.
- **SR Legacy:** Historical standard reference data.
- **Branded:** Data from food manufacturers/labels.
- **Survey:** FNDDS data used in dietary surveys.

## Nutrient IDs (Common)
| Nutrient | ID |
| :--- | :--- |
| Calories | 1008 (Energy in kcal) |
| Protein | 1003 |
| Total Fat | 1004 |
| Carbohydrate | 1005 |
| Fiber | 1079 |
| Sugars | 2000 |
| Calcium | 1087 |
| Iron | 1089 |
| Potassium | 1092 |
| Sodium | 1093 |

## Extracting Macros (JSON Path)
Assuming `response` is the JSON object from `/food/{fdcId}`:
- **Calories:** `foodNutrients.find(n => n.nutrient.id === 1008).amount`
- **Protein:** `foodNutrients.find(n => n.nutrient.id === 1003).amount`
- **Fat:** `foodNutrients.find(n => n.nutrient.id === 1004).amount`
- **Carbs:** `foodNutrients.find(n => n.nutrient.id === 1005).amount`

## Implementation Code

### JavaScript Fetch
```javascript
const searchFood = async (query, apiKey) => {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${query}`;
  const response = await fetch(url);
  return await response.json();
};
```

### Python Requests
```python
import requests

def search_food(query, api_key):
    url = f"https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {'api_key': api_key, 'query': query}
    response = requests.get(url, params=params)
    return response.json()
```

## Rate Limits
- **Default:** 1,000 requests per hour per IP.
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
- **DEMO_KEY:** 30 requests per hour / 50 per day.

## Sample JSON Response
```json
{
  "fdcId": 123456,
  "description": "BEEF, CHICKEN, TURKEY, PORK, LAMB",
  "foodNutrients": [
    {
      "nutrient": { "id": 1003, "name": "Protein", "unitName": "g" },
      "amount": 26.0
    }
  ]
}
```
# SECTION 3: NUTRITION SCIENCE — STRUCTURED KNOWLEDGE BASE

## Macronutrients

### Protein
- **Cutting:** 1.8 - 2.2g per kg of bodyweight.
- **Bulking:** 1.6 - 2.0g per kg of bodyweight.
- **Maintenance:** 1.2 - 1.6g per kg of bodyweight.

### Carbohydrates
- **Role:** Primary energy source for high-intensity training and brain function.
- **Timing:** High-carb meals 2-3 hours pre-workout and immediately post-workout.
- **Types:**
  - **Simple:** Fast-digesting (fruits, white rice, dextrose) for immediate energy/recovery.
  - **Complex:** Slow-digesting (oats, sweet potato, brown rice) for sustained energy.

### Fats
- **Healthy:** Monounsaturated (olive oil, avocado) and Polyunsaturated (omega-3 from fish).
- **Unhealthy:** Trans fats and excessive saturated fats from processed foods.
- **Minimum Requirement:** 0.5 - 1.0g per kg of bodyweight (essential for hormone production).

### Calories
- **BMR (Mifflin-St Jeor):**
  - Men: `(10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5`
  - Women: `(10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161`
- **BMR (Harris-Benedict):**
  - Men: `88.362 + (13.397 × weight in kg) + (4.799 × height in cm) - (5.677 × age in years)`
  - Women: `447.593 + (9.247 × weight in kg) + (3.098 × height in cm) - (4.330 × age in years)`
- **TDEE Formula:** `BMR × Activity Factor`
  - Sedentary: 1.2
  - Lightly Active: 1.375
  - Moderately Active: 1.55
  - Very Active: 1.725
  - Extra Active: 1.9

### Caloric Deficit/Surplus
- **Deficit (Fat Loss):** 300 - 500 calories below TDEE (approx. 0.5kg loss per week).
- **Surplus (Muscle Gain):** 200 - 300 calories above TDEE (lean bulk) or 500+ (aggressive bulk).

## Meal Planning Logic

### Calculation Steps
1. Calculate BMR using Mifflin-St Jeor.
2. Multiply by Activity Factor to get TDEE.
3. Adjust for goal (Deficit/Surplus).
4. Set Protein (e.g., 2g/kg).
5. Set Fat (e.g., 25% of total calories).
6. Fill remainder with Carbohydrates.

### Structure by Goal
| Goal | Macros Ratio (P/C/F) | Timing |
| :--- | :--- | :--- |
| Cutting | 40/30/30 | High protein, moderate carbs around workout. |
| Bulking | 25/55/20 | High carbs, consistent protein throughout. |
| Maintenance | 30/40/30 | Balanced intake. |

### Meal Timing Rules
- **Pre-Workout:** Carbs + Protein (low fat/fiber) 1-2 hours before.
- **Post-Workout:** Fast carbs + High protein within 60 mins.

### Intermittent Fasting
- **16:8:** 16 hours fast, 8 hours eating window (most common).
- **18:6:** 18 hours fast, 6 hours eating window.
- **5:2:** Normal eating for 5 days, 500-600 calories for 2 days.

## Dietary Restrictions Handling

| Restriction | Protein Sources | Substitutes | Deficiencies to Watch |
| :--- | :--- | :--- | :--- |
| Vegan | Tofu, Tempeh, Seitan, Lentils | Soy/Pea milk, Nutritional yeast | B12, Iron, Zinc, Omega-3 |
| Vegetarian | Eggs, Greek Yogurt, Cottage Cheese | Plant-based meats | Iron, B12 |
| Keto | Meat, Fish, Eggs, High-fat dairy | Cauliflower rice, Almond flour | Electrolytes (Na, K, Mg) |
| Halal | Halal-certified meat, Fish, Eggs | Plant-based options | None specific |
| Lactose Intol. | Egg whites, Beef, Chicken | Almond/Oat milk, Lactase pills | Calcium, Vitamin D |
| Gluten Free | Rice, Quinoa, Potatoes | GF Oats, Almond flour | Fiber, B-vitamins |

## High-Value Food Database

### Top High-Protein (per 100g)
1. Chicken Breast: 31g
2. Turkey Breast: 29g
3. Canned Tuna: 26g
4. Lean Beef (90/10): 26g
5. Seitan: 25g
6. Lentils: 9g (cooked)
7. Greek Yogurt: 10g
8. Cottage Cheese: 11g
9. Eggs: 13g (approx 2 large)
10. Tofu: 8g

### Top Complex Carbs (per 100g)
1. Oats: 66g
2. Brown Rice: 23g (cooked)
3. Sweet Potato: 20g
4. Quinoa: 21g (cooked)
5. Chickpeas: 27g

### Healthy Fats
1. Avocado
2. Extra Virgin Olive Oil
3. Walnuts
4. Chia Seeds
5. Salmon (Omega-3)

### Low-Calorie High-Volume
1. Spinach
2. Broccoli
3. Zucchini
4. Cucumber
5. Cauliflower

### Pre/Post Workout
- **Pre:** Banana, Oats, Rice Cakes.
- **Post:** Whey Protein, White Rice, Dextrose, Chicken.
# SECTION 4: EXERCISE & WORKOUT SCIENCE — STRUCTURED KNOWLEDGE BASE

## Training Principles

### Progressive Overload
- **Definition:** The gradual increase of stress placed upon the body during exercise training.
- **Application Methods:**
  1. **Weight:** Increase the load (e.g., +2.5kg to +5kg).
  2. **Reps:** Perform more repetitions with the same weight.
  3. **Sets:** Increase the number of sets per exercise.
  4. **Frequency:** Increase training days per week.
  5. **Intensity:** Decrease rest time or increase tempo (time under tension).

### Volume
- **Formula:** `Sets × Reps × Weight` (Total Tonnage).
- **Hypertrophy Range:** 10 - 20 sets per muscle group per week.

### Frequency
- **Optimal:** 2x per week per muscle group for most lifters.
- **Maintenance:** 1x per week per muscle group.

### Intensity
- **RPE (Rate of Perceived Exertion):**
  - RPE 10: Max effort, 0 reps in reserve (RIR).
  - RPE 9: 1 RIR.
  - RPE 8: 2 RIR.
- **1RM Guidelines:**
  - Strength: 85%+ of 1RM (1-5 reps).
  - Hypertrophy: 60-80% of 1RM (6-12 reps).
  - Endurance: <60% of 1RM (15+ reps).

### Rest Periods
- **Strength:** 3 - 5 minutes.
- **Hypertrophy:** 60 - 90 seconds.
- **Endurance:** 30 - 45 seconds.

### Deload Weeks
- **When:** Every 4-8 weeks or when performance plateaus/fatigue is high.
- **How:** Reduce volume (sets) by 50% or reduce intensity (weight) by 20-30%.

## Workout Splits — Full Breakdown

| Split | Schedule | Target Audience | Pros | Cons |
| :--- | :--- | :--- | :--- | :--- |
| **PPL (Push Pull Legs)** | 6 Days (P-P-L-P-P-L-R) | Intermediate/Advanced | High frequency (2x/week), logical flow. | High recovery demand, 6 days/week. |
| **Upper/Lower** | 4 Days (U-L-R-U-L-R-R) | All Levels | Balanced frequency, good for strength. | Upper days can be long. |
| **Full Body** | 3 Days (FB-R-FB-R-FB-R-R) | Beginners | Maximum efficiency, fast recovery. | Hard to hit high volume per muscle. |
| **Bro Split** | 5 Days (Chest, Back, Shoul, Arms, Legs) | Advanced/Bodybuilders | High focus per muscle, great pump. | Low frequency (1x/week). |
| **Arnold Split** | 6 Days (C+B, S+A, L, C+B, S+A, L) | Advanced | High volume, great for upper body. | Extremely taxing. |

## Exercise Database — Structured

| Muscle Group | Compound Exercises (Cues) | Isolation Exercises (Cues) |
| :--- | :--- | :--- |
| **Chest** | Bench Press (Retract scapula), Incline DB Press | Chest Fly (Hugging a tree), Cable Crossover |
| **Back** | Deadlift (Brace core), Pull-ups (Drive elbows down) | Lat Pulldown, Seated Row (Squeeze blades) |
| **Shoulders** | Overhead Press (Head through window), DB Press | Lateral Raise (Pinkies up), Face Pulls |
| **Biceps** | Chin-ups (Palm up), Barbell Curls | Hammer Curls, Preacher Curls |
| **Triceps** | Close Grip Bench, Dips (Lean forward) | Pushdowns, Overhead Extensions |
| **Quads** | Squats (Hips back), Leg Press | Leg Extensions, Sissy Squats |
| **Hamstrings** | Romanian Deadlift (Hinge), Leg Curls | Glute-Ham Raise, Nordic Curls |
| **Glutes** | Hip Thrusts (Chin tucked), Bulgarian Split Squat | Glute Kickbacks, Cable Pull-throughs |
| **Calves** | Standing Calf Raise (Full stretch) | Seated Calf Raise, Donkey Calf Raise |
| **Abs** | Hanging Leg Raise (Hollow body), Planks | Cable Crunches, Russian Twists |

## Level Identification

| Level | Criteria | Progression Rule |
| :--- | :--- | :--- |
| **Beginner** | < 1 year training, linear gains. | Add weight every workout. |
| **Intermediate** | 1-3 years, plateauing linear gains. | Weekly/Bi-weekly weight/rep increases. |
| **Advanced** | 3+ years, close to genetic potential. | Periodized blocks, monthly gains. |

## Injury Awareness Rules

- **Common Injuries:**
  - Shoulder: Rotator cuff impingement.
  - Back: Herniated disc (L4/L5).
  - Knee: Patellar tendonitis.
- **Exercises to Avoid:** Behind-the-neck press (shoulders), Jefferson curls (unstable back).
- **Safe Substitutes:** Neutral grip DB press (shoulder pain), Box squats (knee pain).
- **Red Flags:** Sharp/shooting pain, joint swelling, numbness/tingling.
# SECTION 5: AI CHATBOT SYSTEM PROMPT ENGINEERING

## Elite System Prompt Structure
1. **Persona:** Expert Fitness & Nutrition Coach.
2. **Knowledge Base:** Integrated Wger and USDA API data.
3. **Constraints:** No medical advice, no vague answers, metric/imperial toggle.
4. **Tone:** Professional, encouraging, data-driven.
5. **Output Format:** Markdown tables for data, bullet points for instructions.

## Persona Engineering Rules
- **Voice:** "You are an elite sports scientist with 20 years of experience."
- **Behavior:** Always ask for missing data before providing a plan.
- **Avoid:** "I am an AI", "As a language model".

## Constraint-Based Techniques
- **Numerical Force:** "All calorie counts must be integers. All macros must sum to the total calories (4/4/9 rule)."
- **Formatting Force:** "Always use | Column 1 | Column 2 | for tables."

## Forbidden Phrases
- "It depends" (unless followed by "on [X] factor, here is the rule for [X]")
- "Consult a doctor" (put this in a standard footer only)
- "I recommend a balanced diet" (be specific about ratios)

## Response Templates

### Meal Plan Template
```markdown
### Daily Meal Plan: [Goal]
- **Breakfast:** [Food] ([Macros])
- **Lunch:** [Food] ([Macros])
- **Dinner:** [Food] ([Macros])
- **Total:** [Calories] | P: [g] | C: [g] | F: [g]
```

### Workout Plan Template
```markdown
### Workout: [Day Name]
| Exercise | Sets | Reps | Rest | Cue |
| :--- | :--- | :--- | :--- | :--- |
| [Name] | [X] | [Y] | [Z] | [C] |
```

## User Onboarding Logic
1. **Required Data:** Age, Sex, Weight (kg), Height (cm), Goal (Cut/Bulk/Main), Activity Level (1.2-1.9), Diet Type, Injuries, Equipment.
2. **Missing Info Handling:** If [Weight] is missing, ask: "To provide an accurate plan, please provide your current weight."
3. **Vague Input Handling:** If user says "I want to get fit", ask: "Does 'get fit' mean losing fat, gaining muscle, or improving endurance?"

## Conversation Flow
- **Context:** Store user macros/TDEE in session.
- **Follow-up:** "Based on your current 2000 calorie target, adding [Food] would increase your carbs by 30g."
# SECTION 6: REAL-TIME CHAT IMPLEMENTATION

## WebSocket vs REST
- **WebSocket:** Use for bi-directional, low-latency, real-time streaming (ideal for long AI responses).
- **REST:** Use for simple command-response or when streaming is not required.

## Streaming Implementation

### OpenAI (Node.js)
```javascript
const stream = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Generate a workout" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

### Anthropic Claude (Node.js)
```javascript
const stream = client.messages.stream({
  model: "claude-3-opus-20240229",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Generate a meal plan" }],
});
stream.on('text', (text) => {
  console.log(text);
});
```

## Optimization Techniques
1. **Token Streaming:** Display text as it's generated to reduce perceived latency.
2. **Prompt Caching:** Cache system prompts to reduce TTFT (Time to First Token).
3. **Edge Functions:** Deploy chat logic on Vercel/Cloudflare Edge to be closer to the user.

## Error Handling
- **API Error:** "The nutrition database is currently unreachable. Please try again in a moment."
- **Rate Limit:** Implement exponential backoff or notify user: "You've reached the message limit. Please wait 60 seconds."
# SECTION 7: ANTI-GENERIC OUTPUT TECHNIQUES

## 20 Specific Prompt Engineering Techniques

1. **Persona Assignment:** "Act as a PhD Sports Scientist with a focus on hypertrophy."
2. **Negative Prompting:** "Do not use words like 'vibrant', 'delve', or 'holistic'."
3. **Chain of Thought (CoT):** "Show your math step-by-step before giving the final calorie count."
4. **Output Constraints:** "Your response must be under 300 words and include exactly 3 bullet points."
5. **Few-Shot Prompting:** Provide 3 examples of a "Perfect Meal Plan" before asking for one.
6. **Self-Critique:** "After generating the plan, review it for any generic advice and rewrite it to be more specific."
7. **Specificity Forcing:** "Instead of 'eat more protein', specify 'consume 30g of whey isolate'."
8. **Temperature Control:** Set temperature to 0.2 for factual nutrition data, 0.7 for creative workout variety.
9. **Delimiters:** Use `###` or `---` to separate instructions from context.
10. **Tone Mirroring:** "Use a direct, no-nonsense tone similar to a military drill instructor."
11. **Knowledge Grounding:** "Only use the provided USDA data; do not hallucinate nutritional values."
12. **Format Enforcement:** "Respond only in a JSON object with keys: 'calories', 'protein', 'carbs', 'fat'."
13. **Comparative Analysis:** "Compare PPL vs Upper/Lower and explain why PPL is better for this specific user."
14. **Counter-Argumentation:** "Tell me why this workout might fail and how to prevent it."
15. **Context Layering:** Provide user's past 3 days of logs to inform the next 3 days.
16. **Role Play with Stakes:** "If you provide an inaccurate calorie count, the user will fail their goal. Be precise."
17. **Iterative Refinement:** "Give me a draft, I will give feedback, then you provide the final version."
18. **Forbidden Word List:** Maintain a list of "AI-isms" to avoid.
19. **Numerical Precision:** "Round all weights to the nearest 2.5kg increment."
20. **Logic Branching:** "If user is vegan, use [Template A], else use [Template B]."

## Technique Deep Dive

### Negative Prompting
- **Instruction:** "DO NOT suggest running as a primary cardio source for users with knee injuries."
- **Effect:** Eliminates common, potentially harmful generic advice.

### Self-Critique Prompting
- **Instruction:** "Critique your own workout plan for volume. Is 30 sets for chest too much? If so, reduce it."
- **Effect:** Forces the AI to apply its own knowledge of science to its output.

### Specificity Forcing
- **Before:** "Eat a healthy breakfast with eggs."
- **After:** "Eat 3 large boiled eggs (18g protein) with 50g of dry-weight oats (33g carbs)."

## Real Examples

| Generic Output | Anti-Generic Output | Technique Used |
| :--- | :--- | :--- |
| "Go to the gym 3 times a week and lift weights." | "Follow a 3-day Full Body split (Mon/Wed/Fri) focusing on compound lifts at 75% 1RM." | Specificity Forcing |
| "Eat more fruits and vegetables for health." | "Consume 200g of spinach and 100g of blueberries daily to meet your Vitamin K and antioxidant needs." | Knowledge Grounding |
| "It's important to stay hydrated during exercise." | "Drink 500ml of water with 1g of sea salt 30 minutes before your session to maintain electrolyte balance." | Logic Branching |
# SECTION 8: FULL INTEGRATION CODE

## Wger API Integration (Node.js)
```javascript
const axios = require('axios');

async function getWgerExercises(muscleId, equipmentId) {
    const url = 'https://wger.de/api/v2/exercise/';
    const params = {
        muscles: muscleId,
        equipment: equipmentId,
        language: 2, // English
        format: 'json'
    };
    try {
        const response = await axios.get(url, { params });
        return response.data.results.map(ex => ({
            name: ex.name,
            description: ex.description.replace(/<[^>]*>/g, ''), // Strip HTML
            id: ex.id
        }));
    } catch (error) {
        console.error('Wger API Error:', error);
        return [];
    }
}
```

## USDA API Integration (Node.js)
```javascript
async function getUSDAMacros(fdcId, apiKey) {
    const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;
    try {
        const response = await axios.get(url);
        const nutrients = response.data.foodNutrients;
        const findNutrient = (id) => nutrients.find(n => n.nutrient.id === id)?.amount || 0;
        
        return {
            name: response.data.description,
            calories: findNutrient(1008),
            protein: findNutrient(1003),
            fat: findNutrient(1004),
            carbs: findNutrient(1005)
        };
    } catch (error) {
        console.error('USDA API Error:', error);
        return null;
    }
}
```

## TDEE Calculation (JavaScript)
```javascript
function calculateTDEE(user) {
    // Mifflin-St Jeor Equation
    let bmr;
    if (user.gender === 'male') {
        bmr = (10 * user.weight) + (6.25 * user.height) - (5 * user.age) + 5;
    } else {
        bmr = (10 * user.weight) + (6.25 * user.height) - (5 * user.age) - 161;
    }
    
    const activityMultipliers = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        very: 1.725,
        extra: 1.9
    };
    
    return Math.round(bmr * activityMultipliers[user.activityLevel]);
}
```

## Meal Plan Macro Generator
```javascript
function generateMacros(tdee, goal) {
    let targetCalories;
    if (goal === 'cut') targetCalories = tdee - 500;
    else if (goal === 'bulk') targetCalories = tdee + 300;
    else targetCalories = tdee;

    // Standard 40/30/30 Split
    return {
        calories: targetCalories,
        protein: Math.round((targetCalories * 0.4) / 4),
        carbs: Math.round((targetCalories * 0.3) / 4),
        fat: Math.round((targetCalories * 0.3) / 9)
    };
}
```

## Workout Split Recommender
```javascript
function recommendSplit(level, daysAvailable) {
    if (level === 'beginner') return 'Full Body (3 Days)';
    if (daysAvailable >= 6) return 'PPL (Push Pull Legs)';
    if (daysAvailable >= 4) return 'Upper/Lower';
    return 'Full Body (3 Days)';
}
```

## Dynamic System Prompt Template
```markdown
You are a Fitness AI. Use the following data to build a plan:
- User TDEE: {{tdee}}
- Target Macros: P:{{p}}g, C:{{c}}g, F:{{f}}g
- Available Exercises: {{exercise_list}}

Rules:
1. Use only the exercises listed.
2. Ensure protein is within 5g of the target.
3. Format output as a Markdown table.
```
