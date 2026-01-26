---
description: Analyze a problem using structured first-principles reasoning to identify root cause and minimal fix.
---

**Usage**
```
/first-principles-analysis <problem-description>
```
The problem description should include the bug/issue and relevant file references.

**Guardrails**
- Focus on understanding before solving — but partial understanding is acceptable.
- Verify every assumption by reading actual code; never guess.
- Stop and ask for clarification if the problem statement is ambiguous.
- It is OK to identify "areas of uncertainty" that require further investigation.

**Steps**

1. **Decompose the Problem**
   - State the problem in one sentence.
   - Identify the affected system boundary (component, module, service).
   - List the inputs, outputs, and expected transformation.

2. **Establish Ground Truth**
   - Read the relevant code to understand current behavior.
   - Identify the exact code path from input to output.
   - Document what the code *actually does* (not what it should do).

3. **Identify the Deviation**
   - Compare expected behavior vs actual behavior.
   - Pinpoint the exact location where behavior diverges (if determinable).
   - Express the deviation as: "At [location], [X happens] but [Y should happen]."
   - If deviation point is unclear, note: "Likely in [area], requires further investigation."

4. **Trace Toward Root Cause**
   - Ask "Why does [deviation] occur?" — answer with code evidence.
   - Repeat "Why?" as far as current evidence allows.
   - Distinguish between:
     - **Confirmed**: Root cause identified with code evidence.
     - **Hypothesis**: Likely cause, needs verification.
     - **Unknown**: Requires deeper investigation (note what to investigate).

5. **Identify Solution Starting Point**
   - Based on findings, identify the most likely area(s) to fix.
   - List 1-3 possible approaches, ordered by scope (smallest first).
   - For each, note: location, change required, confidence level.
   - Flag any uncertainties that affect the fix approach.

6. **Output Analysis Summary**
   Produce a structured summary:
   ```
   ## Problem
   [One sentence]

   ## Ground Truth
   - Current behavior: [what code does]
   - Expected behavior: [what it should do]
   - Deviation point: [file:line or "TBD - likely in [area]"]

   ## Root Cause Analysis
   - Status: [Confirmed / Hypothesis / Requires Investigation]
   - Finding: [Why the deviation occurs, with code evidence]
   - Unknowns: [What still needs investigation, if any]

   ## Solution Starting Point
   - Location: [file:line or area]
   - Approach: [description]
   - Confidence: [high/medium/low]
   - Next steps: [what to verify or investigate further]
   ```
