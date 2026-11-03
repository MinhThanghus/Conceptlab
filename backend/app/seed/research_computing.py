"""Research lessons in computing, engineering, and economics.

Source notes contain citations and paraphrased summaries, not full papers.
ConceptLab's examples and questions do not reproduce the reported experiments.
"""

from __future__ import annotations

from .demo import Ctx, DemoDef, SourceDef, question
from .visual_extensions import DEMO_VISUALS, visual_block


def _block(bid, typ, title, description="", refs=(), **data):
    return {"id": bid, "type": typ, "title": title, "description": description,
            "source_refs": list(refs), "confirmed": True, "ai_generated": False, **data}


def _make_builder(paper):
    def build(c: Ctx):
        ref = c.ref("paper")
        nodes = [{"id": f"n{i}", "label": label, "description": description, "source_refs": [ref]}
                 for i, (label, description) in enumerate(paper["nodes"], 1)]
        edges = [{"id": f"e{i}", "source": f"n{i}", "target": f"n{i + 1}", "label": "",
                  "description": "", "source_refs": []} for i in range(1, len(nodes))]
        blocks = [
            _block("context", "text", "Read the research", refs=[ref],
                   body=f'{paper["summary"]}\n\nOriginal paper: {paper["citation"]}. Source [1]. '
                        'Open the source to see the link and citation. The source note is not the full paper.'),
            _block("flow", "flow", "Explore the idea", "Select each step to learn more. This overview was prepared by ConceptLab.",
                   refs=[ref], layout="linear", nodes=nodes, edges=edges),
        ]
        if paper.get("algorithm"):
            alg = paper["algorithm"]
            blocks.append(_block("practice", "algorithm", alg["title"], alg["description"],
                                 algorithm=alg["kind"], config=alg["config"], explanation=alg["explanation"]))
        if paper['code'] in DEMO_VISUALS:
            blocks.append(visual_block(paper['code'], [ref]))
        blocks.append(_block("quiz", "quiz", "Check your understanding", questions=[
            question("q1", "mcq", paper["prompt"], paper["options"], answer_index=0,
                     explanation=paper["answer"], refs=[ref])]))
        return {"schema_version": 1, "summary": paper["summary"],
                "objectives": ["Explain the research question and its main ideas.",
                               "Distinguish learning examples from the paper's data and results."],
                "assumptions": [{"id": "a1", "text": "The diagram and examples are teaching illustrations, not reproductions of the paper's experiments or quantitative results.", "confirmed": True}],
                "blocks": blocks}, None
    return build


PAPERS = [
    {
        "code": "RNSRTA", "subject": "informatics", "title": "Sequential and parallel sorting",
        "citation": "Darko Bozidar, Tomaz Dobravec (2015), Comparison of parallel sorting algorithms",
        "url": "https://arxiv.org/abs/1511.03404",
        "summary": "This preprint compares seven sorting algorithms, with sequential CPU and parallel GPU implementations, across several types of input data.",
        "nodes": [("Input", "The study considers different distributions and types of input data."),
                  ("Algorithms", "The algorithms compared include quicksort, merge sort and radix sort."),
                  ("Evaluation", "Sequential CPU and parallel GPU implementations are compared; results depend on the environment and input.")],
        "prompt": "What should you consider when reading an algorithm comparison?",
        "options": ["The input data and execution environment", "Only the algorithm's name", "Only the colors in the chart"],
        "answer": "Performance depends on the data and environment. The paper uses multiple input distributions and CPU and GPU environments.",
        "algorithm": {"kind": "quick_sort", "title": "Try quicksort step by step", "description": "These numbers were created for learning, not taken from the paper's benchmarks.",
                      "config": {"array": [7, 3, 9, 1, 5]}, "explanation": "Observe pivot selection and partitioning. This illustration does not measure CPU or GPU time."},
    },
    {
        "code": "RNEDTA", "subject": "informatics", "title": "Edit distance between strings",
        "citation": "Tomasz Kociumaka, Anish Mukherjee, Barna Saha (2023), Approximating Edit Distance in the Fully Dynamic Model",
        "url": "https://arxiv.org/abs/2307.07175",
        "summary": "The paper studies algorithms that approximate edit distance when strings can change in a dynamic model.",
        "nodes": [("Two strings", "Edit distance is the minimum number of operations needed to transform one string into another."),
                  ("Operations", "The basic operations are inserting, deleting and substituting characters."),
                  ("Dynamic model", "The paper studies how to maintain an approximate value when inputs are updated.")],
        "prompt": "Which operations are considered by edit distance?",
        "options": ["Inserting, deleting and substituting characters", "Only changing character colors", "Only changing the font size"],
        "answer": "The definition in the paper's abstract uses character insertions, deletions and substitutions.",
    },
    {
        "code": "RNATTA", "subject": "computer_science", "title": "Attention in the Transformer",
        "citation": "Ashish Vaswani et al. (2017), Attention Is All You Need",
        "url": "https://arxiv.org/abs/1706.03762",
        "summary": "The paper introduces the Transformer, a sequence-processing architecture based on attention instead of recurrence and convolution.",
        "nodes": [("Queries and keys", "Compare queries Q with keys K to calculate attention scores."),
                  ("Normalization", "Divide by the square root of the key dimension and use softmax to obtain weights."),
                  ("Values", "Use the attention weights to combine values V into the output.")],
        "prompt": "What are attention weights used for?",
        "options": ["Combining values V", "Deleting the entire input", "Counting the model's layers"],
        "answer": "Attention weights are used to calculate a combination of values V.",
        "algorithm": {"kind": "attention", "title": "Try attention", "description": "Change the small example matrices and observe the weights.",
                      "config": {"tokens": ["item 1", "item 2", "item 3"], "Q": [[1, 0], [0, 1], [1, 1]],
                                 "K": [[1, 0], [0, 1], [1, 1]], "V": [[1, 0], [0, 1], [0.5, 0.5]]},
                      "explanation": "This example was created to illustrate attention; it does not reproduce the paper's training or machine translation results."},
    },
    {
        "code": "RNDFFA", "subject": "computer_science", "title": "Denoising diffusion models",
        "citation": "Jonathan Ho, Ajay Jain, Pieter Abbeel (2020), Denoising Diffusion Probabilistic Models",
        "url": "https://arxiv.org/abs/2006.11239",
        "summary": "The paper studies probabilistic diffusion models that generate images through a denoising process.",
        "nodes": [("Data", "Begin with dataset images and a process that adds noise over several steps."),
                  ("Learn to denoise", "Train a model to learn information for reversing the noise process."),
                  ("Generate samples", "Use the learned reverse process to generate new samples from noise.")],
        "prompt": "What does the reverse process do in a diffusion model?",
        "options": ["Gradually remove noise to generate a sample", "Always add noise without learning", "Sort pixels alphabetically"],
        "answer": "The learned reverse process transforms noise into a sample over multiple steps. This diagram only summarizes the idea.",
    },
    {
        "code": "RNUAVA", "subject": "engineering", "title": "Controlling a quadrotor aircraft",
        "citation": "Farhad Goodarzi, Daewon Lee, Taeyoung Lee (2013), Geometric Nonlinear PID Control of a Quadrotor UAV on SE(3)",
        "url": "https://arxiv.org/abs/1304.6765",
        "summary": "The paper proposes a geometric nonlinear PID controller for the position and attitude of a quadrotor aircraft.",
        "nodes": [("Target", "Set a desired position or attitude to track."),
                  ("Control", "The controller uses error information to determine how to act on the aircraft."),
                  ("Feedback", "The aircraft's changing state is used to continue controlling it.")],
        "prompt": "What is the purpose of feedback in this overview?",
        "options": ["Use the state to continue adjusting control", "Remove the target entirely", "Turn the aircraft into a map"],
        "answer": "Feedback control uses state information to adjust the control action. The diagram does not execute the paper's controller.",
    },
    {
        "code": "RNSPVA", "subject": "engineering", "title": "Cracks and solar cell performance",
        "citation": "Mahmoud Dhimish, Yihua Hu (2022), Rapid testing on the effect of cracks on solar cells output power performance and thermal operation, Scientific Reports",
        "url": "https://doi.org/10.1038/s41598-022-16546-z",
        "summary": "The study examines how cracks in solar cells affect output power and thermal operation.",
        "nodes": [("Cell samples", "Observe cracks in the photovoltaic cells."),
                  ("Measurement", "Examine the samples' electrical performance and thermal state."),
                  ("Comparison", "Compare the results to understand the effects of cracks under the test conditions.")],
        "prompt": "Which aspects of solar cells does the study examine?",
        "options": ["Output power and thermal operation", "Only the packaging color", "Only transportation costs"],
        "answer": "The paper's title names both output power performance and thermal operation.",
    },
    {
        "code": "RNECNA", "subject": "economics", "title": "Experiments in economics",
        "citation": "Vernon L. Smith (1994), Economics in the Laboratory, Journal of Economic Perspectives, DOI 10.1257/jep.8.1.113",
        "url": "https://www.aeaweb.org/articles?id=10.1257/jep.8.1.113",
        "summary": "This review discusses economic experiments: why they are conducted, how they are designed and what they can reveal about market behavior.",
        "nodes": [("Question", "Choose a question about behavior and design rules for participants."),
                  ("Experiment", "Observe participants' decisions in an environment with defined rules."),
                  ("Interpretation", "Consider the role of trading rules and the limits of generalizing results.")],
        "prompt": "According to the review, what can affect market outcomes?",
        "options": ["Institutions and trading rules", "Only the color of a laboratory table", "Nothing at all"],
        "answer": "The review emphasizes the role of institutions and trading rules; it discusses methods and experimental findings.",
    },
    {
        "code": "RNECNB", "subject": "economics", "title": "Grace periods in microfinance",
        "citation": "Erica Field, Rohini Pande, John Papp, Natalia Rigol (2013), Does the Classic Microfinance Model Discourage Entrepreneurship among the Poor? Experimental Evidence from India, American Economic Review, DOI 10.1257/aer.103.6.2196",
        "url": "https://www.aeaweb.org/articles?id=10.1257/aer.103.6.2196",
        "summary": "A field experiment in India compares immediate repayment contracts with contracts offering a two-month grace period.",
        "nodes": [("Compare contracts", "The study compares immediate repayment with a two-month grace period."),
                  ("Investment and profits", "The abstract reports increased short-term investment and long-term profits in the grace-period group."),
                  ("Risk", "The abstract also reports an increase in default rates. Interpret the findings in the context of the study.")],
        "prompt": "According to the abstract, what should be considered alongside the investment benefits?",
        "options": ["Default rates also increased in the study", "A grace period is always risk-free", "The study context does not matter"],
        "answer": "The paper reports increased investment, profits and default rates in the context of the study in India.",
    },
]


RESEARCH_COMPUTING_DEMOS = [
    DemoDef(p["code"], "paper2explorer", p["title"], p["subject"], "university", p["title"],
            "explore_paper", "detailed", [SourceDef("paper", "note", "Paper citation and original link",
            text=f'{p["citation"]}\n{p["url"]}\n\n{p["summary"]}\n\nThis citation and paraphrase were prepared by ConceptLab; open the link to read the original source.')],
            _make_builder(p), language="en")
    for p in PAPERS
]
