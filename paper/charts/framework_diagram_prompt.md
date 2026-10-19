# Framework Diagram Prompt

**Paper**: VARIA: Benchmarking Frontier LLMs on Construct-Equivalent Assessment Variant Generation

## Image Generation Prompt

Create a clean, professional academic methodology diagram for an ML conference paper, vector-art flat design with subtle drop shadows on a white background (#FFFFFF). Layout flows left-to-right in four vertical stages connected by directional arrows.

Stage 1 (left, soft purple #AA3377): "Assessment Blueprints" — three stacked rounded rectangles labeled "Audit Task", "Stakeholder Comm.", "Ethical Risk Analysis", each with a small construct-map icon.

Stage 2 (muted blue #4477AA): "Generation Engine" — a large rounded container holding a 3×4 grid. Rows labeled "Claude", "GPT", "Gemini"; columns labeled "Zero-shot", "Few-shot", "Structured CoT", "Constrained Gen". Below, a smaller dimmed strip labeled "Reference: GPT-2, Ablations".

Stage 3 (teal #44AA99): "Variant Sets" — three stacked cylinders labeled "N=10", "N=35", "N=100" with small document-stack glyphs feeding outward.

Stage 4 (warm accent #CCBB44): "Four-Property Evaluation" — a 2×2 panel of rounded boxes: "Surface Diversity (cosine, BLEU, n-gram)", "Construct Equivalence (LLM-judge + self-consistency)", "Rubric Stability (score variance)", "Difficulty Parity (Flesch, lexical, steps)".

Far right (dark slate #333344): a single rounded outcome box "Pareto Analysis & Generation Protocol" with a small trade-off curve glyph showing diversity vs. equivalence.

Use thin grey directional arrows (#888888), 8pt sans-serif labels (Inter or Helvetica), rounded corners (6px radius), generous whitespace, subtle 10% shadows. Include a small legend bottom-left mapping colors to pipeline stages. No photorealism, no decorative clutter, minimal text — only component names and key metric annotations.

## Usage Instructions

1. Copy the prompt above into an AI image generator (DALL-E 3, Midjourney, Ideogram, etc.)
2. Generate the image at high resolution (2048x1024 or similar landscape)
3. Save as `framework_diagram.png` in the same `charts/` folder
4. Insert into the paper's Method section using:
   - LaTeX: `\includegraphics[width=\textwidth]{charts/framework_diagram.png}`
   - Markdown: `![Framework Overview](charts/framework_diagram.png)`
