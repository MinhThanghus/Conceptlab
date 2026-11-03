"""Natural-science lessons based on public sources.

These are educational interpretations, not copies of the papers. Graph values
are illustrative and do not reproduce measurements unless explicitly stated.
"""

from __future__ import annotations

from .demo import Ctx, DemoDef, SourceDef, q, question
from .visual_extensions import DEMO_VISUALS, visual_block


def _make_demo(code, subject, title, citation, url, doi, summary, stages, questions, graph=None):
    source_text = f"{citation}\nSource: {url}"
    if doi:
        source_text += f"\nDOI: {doi}"
    source_text += "\nThis lesson is an educational interpretation of the source, not new experimental data."

    def build(c: Ctx):
        ref = c.ref("paper")
        blocks = [
            {"id": "steps", "type": "steps", "title": "Explore step by step",
             "description": "Read each step and consider the question before continuing.",
             "source_refs": [ref], "confirmed": True, "sequence_confirmed": True,
             "steps": [{"id": f"s{i}", "title": label, "body": body,
                        "check_question": check, "source_refs": [ref]}
                       for i, (label, body, check) in enumerate(stages, 1)]},
            {"id": "flow", "type": "flow", "title": "Map of ideas",
             "description": "Select each element to explore its meaning and connections.",
             "source_refs": [ref], "confirmed": True, "layout": "linear",
             "nodes": [{"id": f"n{i}", "label": label, "description": body, "source_refs": [ref]}
                       for i, (label, body, _) in enumerate(stages, 1)],
             "edges": [{"id": f"e{i}", "source": f"n{i}", "target": f"n{i+1}"}
                       for i in range(1, len(stages))]},
        ]
        if code in ("RNBYA3", "RNGYA2"):
            enzyme = code == "RNBYA3"
            blocks.append({
                "id": "visual3d", "type": "text", "confirmed": True, "source_refs": [ref],
                "title": "Explore enzyme binding in 3D" if enzyme else "Explore a population grid in 3D",
                "visual3d": "enzyme_binding" if enzyme else "population_grid",
                "body": (
                    "An abstract enzyme and substrate illustrate the idea of binding. Change the number of substrate symbols and rotate the model. Shapes, positions and counts are invented for learning; they are not a molecular structure or data from the paper."
                    if enzyme else
                    "A fictitious 5 × 5 grid shows how population can be represented by cell heights. Change the display scale and rotate the model. These values and locations are invented for learning and are not the paper's population dataset."
                ),
            })
        if code == "RNPHY3":
            blocks.append({
                "id": "pendulum3d", "type": "simulation", "title": "Explore an ideal pendulum in 3D",
                "description": "Change the length or starting angle and compare the resulting motion.",
                "source_refs": [ref], "confirmed": True, "model": "pendulum",
                "params": [
                    q("L", "String length", "m", .8, .1, 2.5, .01, "input", "assumption"),
                    q("g", "Gravitational acceleration", "m/s²", 9.81, 1.6, 24.8, .01, "constant", "assumption"),
                    q("theta0", "Initial angle", "°", 8, 2, 60, 1, "input", "assumption"),
                ],
                "notes": "An idealized small-angle teaching model with illustrative settings; it does not reproduce the paper's experiment. At larger angles the small-angle approximation becomes less accurate.",
            })
        if graph:
            blocks.append({"id": "graph", "type": "graph", "confirmed": True,
                           "source_refs": [ref], **graph})
        if code in DEMO_VISUALS:
            blocks.append(visual_block(code, [ref]))
        blocks.append({"id": "quiz", "type": "quiz", "title": "Check your understanding",
                       "source_refs": [ref], "confirmed": True,
                       "questions": [question(f"q{i}", "mcq", prompt, options,
                                              answer_index=answer, explanation=explanation, refs=[ref])
                                     for i, (prompt, options, answer, explanation) in enumerate(questions, 1)]})
        return {"schema_version": 1,
                "summary": f"{summary} This lesson is based on the abstract or full text of the linked paper.",
                "objectives": [f"Explain the main ideas in {title.lower()}.",
                               "Distinguish research conclusions from educational examples and assumptions."],
                "assumptions": [{"id": "a1", "confirmed": True,
                                 "text": "Diagrams and examples are educational materials created by ConceptLab, not measurements from the paper. Graph values, where present, are illustrative assumptions."}],
                "blocks": blocks}, None

    return DemoDef(code, "paper2explorer", title, subject, "university", title,
                   "explore_paper", "detailed", [SourceDef("paper", "note", citation, text=source_text)], build, language="en")


RESEARCH_NATURAL_DEMOS = [
    _make_demo(
        "RNMAT3", "math", "The logistic map and chaos",
        "A. Diaz-Ruelas, F. Baldovin, A. Robledo (2021), Logistic map trajectory distributions: Renormalization-group, entropy, and criticality at the transition to chaos, Chaos 31, 033112.",
        "https://arxiv.org/abs/2102.08102", "10.1063/5.0040544",
        "Explore a nonlinear iteration and why trajectories can be stable, periodic or chaotic.",
        [("Iteration", "The paper studies the quadratic map x next = 1 − μx². Repeatedly apply the rule from an initial value to form a trajectory.", "How is a trajectory generated?"),
         ("Parameter", "Changing μ changes the rule and can change the long-term behavior of a trajectory.", "Are you studying the same rule after changing the parameter?"),
         ("Distribution", "The study examines the distribution of many trajectories, not just one path.", "Why do multiple starting points provide more information?")],
        [("What does the paper analyze beyond a single trajectory?", ["The distribution of many trajectories", "The color of the graph", "A mountain's height"], 0, "The authors study distributions of iterations."),
         ("What determines the next value of the map?", ["The current value and parameter", "A new random number each time", "Only the time of day"], 0, "This iteration is determined by the previous value and parameter.")],
        {"title": "Try the quadratic rule", "description": "The plotted rule and μ are illustrative assumptions, not experimental data.",
         "expression": "1-mu*x^2", "x_var": "x", "x_min": -1, "x_max": 1,
         "x_label": "Current value x", "y_label": "Next value", "params": [q("mu", "Parameter μ", "", 1.2, 0, 2, .05, provenance="assumption")],
         "explanation": "Adjust μ to change the map. This graph shows one step, not the full trajectory."}),
    _make_demo(
        "RNMAT2", "math", "Random walks and diffusion",
        "L. Vlahos, H. Isliker, Y. Kominis, K. Hizanidis (2008), Normal and Anomalous Diffusion: A Tutorial, arXiv preprint.",
        "https://arxiv.org/abs/0805.0419", None,
        "Explore how random steps create a distribution of positions and relate to diffusion.",
        [("One step", "In this illustrative one-dimensional model, each step goes left or right with equal probability.", "Which directions can one step take?"),
         ("Many steps", "The final position is the sum of the steps. Different trials can give different results.", "Why can two trials end at different positions?"),
         ("Distribution", "Collect many trials to see the distribution. The tutorial connects random walks, the central limit theorem and diffusion equations.", "Can one result describe a distribution?")],
        [("How can you observe a distribution of positions?", ["Repeat many trials", "Look at only one trial", "Ignore the direction of each step"], 0, "A distribution describes results across many trials."),
         ("What is the random walk in this lesson?", ["A mathematical model", "A photograph of actual molecules", "A guaranteed outcome of every trial"], 0, "The example teaches a model; it is not a measurement.")]),
    _make_demo(
        "RNPHY3", "physics", "Testing a simple pendulum model",
        "I. Descamps et al. (2026), Lessons from pendulums: A design comparison of three lab activities, Physical Review Physics Education Research 22, 010137.",
        "https://journals.aps.org/prper/abstract/10.1103/6g9j-s2cm", "10.1103/6g9j-s2cm",
        "Compare small-angle period predictions with observations and explore measurement accuracy.",
        [("Model", "For small angles the ideal model gives T = 2π√(L/g), where L is length and g is gravitational acceleration.", "If L becomes four times larger, how does the period change?"),
         ("Measurement", "Timing several oscillations and dividing by their number can reduce the effect of stopwatch error.", "Why report measurement uncertainty?"),
         ("Test the limits", "The paper discusses detecting the dependence of period on amplitude, a small deviation from the simple harmonic model.", "Is the small-angle formula accurate at every amplitude?")],
        [("If the length quadruples in the small-angle model, what happens to the period?", ["It doubles", "It quadruples", "It stays the same"], 0, "The period is proportional to the square root of the length."),
         ("What should you do at large amplitudes?", ["Check the limits of the small-angle model", "Assert that the period always stays the same", "Ignore all measurements"], 0, "An approximation has a range of validity.")],
        {"title": "Period versus length", "description": "Small-angle model; the assumed value of g can be changed.", "expression": "2*pi*sqrt(L/g)", "x_var": "L", "x_min": .1, "x_max": 3,
         "x_label": "Length L (m)", "y_label": "Period T (s)", "params": [q("g", "Gravitational acceleration", "m/s²", 9.81, 1.6, 24.8, .01, provenance="assumption")], "explanation": "This is an ideal prediction, not a measurement published in the study."}),
    _make_demo(
        "RNPHY2", "physics", "Multi-arm pendulums and chaos",
        "K. Kaheman et al. (2023), The experimental multi-arm pendulum on a cart: A benchmark system for chaos, learning, and control, HardwareX.",
        "https://arxiv.org/abs/2205.06231", "10.1016/j.ohx.2023.e00465",
        "Explore a multi-arm pendulum used to study dynamics and sensitivity to initial conditions.",
        [("Mechanical system", "The study describes a cart carrying a pendulum with one, two or three connected arms.", "Can adding an arm make the motion richer?"),
         ("Initial conditions", "Initial angles and velocities help determine motion in the model. Nearby states can diverge over time in chaotic regimes.", "Do very similar starting conditions always produce nearby trajectories?"),
         ("Model and experiment", "The authors publish designs, data and code so others can study the system and test methods.", "What should a model be compared against?")],
        [("What behavior can occur in a multi-arm pendulum?", ["Chaotic motion", "It cannot move", "It always repeats exactly after one second"], 0, "Depending on conditions, the system can show simple or chaotic motion."),
         ("Why are open data and designs useful?", ["They let others check and reproduce the research", "They automatically make every result correct", "They replace uncertainty analysis"], 0, "Open resources allow independent checking.")]),
    _make_demo(
        "RNCHE3", "chemistry", "Reaction waves and temperature",
        "L. Howell, E. Osborne, A. Franklin, É. Hébrard (2021), Pattern Recognition of Chemical Waves: Finding the Activation Energy of the Autocatalytic Step in the Belousov–Zhabotinsky Reaction, Journal of Physical Chemistry B.",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7898267/", "10.1021/acs.jpcb.0c11079",
        "Explore waves in the Belousov–Zhabotinsky reaction and how temperature affects them.",
        [("Chemical waves", "The Belousov–Zhabotinsky reaction can produce propagating waves in a reaction-diffusion system.", "Is a chemical wave the same as a solid object moving as a whole?"),
         ("Measuring temperature effects", "The authors observed waves at temperatures from 9.9 to 43.3 °C and estimated their speed from images.", "Why measure at several temperatures?"),
         ("Interpretation", "Wave speed changes strongly with temperature. The authors use an Arrhenius-type relationship and the Oregonator model to estimate an effective activation energy.", "Does this result automatically apply to every reaction?")],
        [("Which quantity did the authors vary?", ["Temperature", "The color of writing paper", "Pendulum length"], 0, "The study examines the effect of temperature on chemical waves."),
         ("How is activation energy inferred here?", ["From wave-speed measurements and a model", "Measured directly with a ruler", "From the reaction's name alone"], 0, "The conclusion depends on measurements and a model and has uncertainty.")]),
    _make_demo(
        "RNCHE2", "chemistry", "Solution spreading through paper",
        "Md. S. H. Sajib, Md. S. Rafid, M. R. Khan (2025), Experiment and modeling of concentration-dependent diffusion in a solution with dual transport-phase flow for paper-based sensing, RSC Advances 15, 18670–18680.",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12134741/", "10.1039/d5ra02347e",
        "Explore potassium permanganate spreading on paper and distinguish the observed front from diffusion length.",
        [("Two processes", "In the experiment, water wicks through paper while the dye moves with the water and also diffuses.", "Why should water flow and diffusion be treated separately?"),
         ("Tracking the front", "The authors use video images to locate the visible front at different times and concentrations.", "Can the visibility threshold affect the measured distance?"),
         ("Distinguishing quantities", "Front distance defined by an absolute threshold can depend on initial concentration; normalized diffusion length is a different concept.", "Can two differently defined measurements be directly compared?")],
        [("How is the front identified?", ["By a threshold in the image or concentration", "By the color of the laboratory table", "By the number of video viewers"], 0, "A threshold identifies the position of the dye front."),
         ("Are front distance and diffusion length interchangeable?", ["No, their definitions differ", "Yes, in every case", "Yes, because both are measured in meters"], 0, "The paper explains the difference between the quantities.")]),
    _make_demo(
        "RNBYA3", "biology", "Enzymes and substrate concentration",
        "S. W. Runge, B. J. F. Hill, W. M. Moran (2006), A Simple Classroom Teaching Technique To Help Students Understand Michaelis-Menten Kinetics, CBE—Life Sciences Education.",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC1681365/", "10.1187/cbe.06-04-0160",
        "Use an analogy with marbles and hands to learn how enzyme reaction rates change with substrate concentration.",
        [("Analogy", "In the classroom activity, hands represent enzymes, marbles are substrates, and transferring marbles represents product formation.", "What do the marbles represent in this analogy?"),
         ("Add substrate", "With more marbles, the number transferred per unit time rises, but the rate cannot rise indefinitely because transfer capacity is limited.", "When hands are continuously busy, will adding marbles keep increasing the rate indefinitely?"),
         ("Saturation curve", "The Michaelis–Menten curve describes the initial rate approaching a maximum; the model has conditions of applicability.", "Why specify that the model describes initial rate?")],
        [("What do hands represent in the analogy?", ["Enzymes", "Substrates", "Thermometers"], 0, "Hands play the catalytic role in the example."),
         ("In the simple model, what happens when substrate is abundant?", ["The rate approaches a maximum", "The rate grows without limit", "The rate always falls to zero"], 0, "The rate saturates when enzymes become limiting.")],
        {"title": "Illustrative saturation curve", "description": "Vmax and Km are assumptions, not measurements from the paper.", "expression": "Vmax*S/(Km+S)", "x_var": "S", "x_min": 0, "x_max": 10, "x_label": "Substrate concentration S", "y_label": "Initial rate",
         "params": [q("Vmax", "Maximum rate", "", 1, .2, 3, .1, provenance="assumption"), q("Km", "Constant Km", "", 2, .2, 6, .1, provenance="assumption")],
         "explanation": "When S = Km, the rate equals half of Vmax in the model. This simple graph does not reproduce classroom data."}),
    _make_demo(
        "RNBYA2", "biology", "Enzymes: product and rate over time",
        "W. Cao, E. M. De La Cruz (2013), Quantitative full time course analysis of nonlinear enzyme cycling kinetics, Scientific Reports 3, 2658.",
        "https://www.nature.com/articles/srep02658", "10.1038/srep02658",
        "Explore why enzyme reaction product does not necessarily increase linearly over time.",
        [("Progress curve", "A progress curve shows product over time; its slope represents the rate at that moment.", "What does a curve that gradually flattens indicate about the rate?"),
         ("Causes", "As a reaction proceeds, substrate can decrease and product can inhibit the enzyme, making the progress curve nonlinear.", "Why can't we assume a constant rate?"),
         ("Limits", "The paper proposes full time-course analysis for steady-state activity, with assumptions and limitations stated in its method.", "Does a steady-state model necessarily apply to every initial phase?")],
        [("What does the slope of product versus time represent?", ["The rate of product formation", "The mass of the container", "Molecule length"], 0, "The slope is the rate of change over time."),
         ("What can make a progress curve nonlinear?", ["Substrate depletion or product inhibition", "Changing only the color of the graph", "Increasing font size"], 0, "These mechanisms can change the rate over time.")]),
    _make_demo(
        "RNGYA3", "geography", "Elevation and rainfall in the Himalayas",
        "D. Cao et al. (2026), Elevation-Dependent Variations of Summer Precipitation on the Southern Slopes of the Central and Eastern Himalayas, Journal of Geophysical Research: Atmospheres 131, e2025JD045865.",
        "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JD045865", "10.1029/2025JD045865",
        "Explore how precipitation changes with elevation in two surveyed Himalayan regions.",
        [("Field observations", "The authors compare data from two networks of rain gauges at different elevations in the Himalayas.", "Why place stations at several elevations?"),
         ("Trend", "In the two study regions, summer precipitation rises to a maximum around 2,500 m then falls at higher surveyed elevations.", "Does rainfall always increase with elevation in this study?"),
         ("Scope", "This result applies to the studied region, season and elevation range; it is not a rule for every mountain range.", "What else would you need to know before applying the result elsewhere?")],
        [("What do the results for the two study regions show?", ["Rainfall peaks near 2,500 m and then declines", "Rainfall always rises at every elevation", "All mountain regions have identical rainfall"], 0, "The paper reports a rainfall maximum near 2,500 m in the two regions."),
         ("What matters when interpreting a geographical result?", ["The region and season studied", "Only the author's name", "Only the map color"], 0, "Spatial and temporal limits affect generalization.")]),
    _make_demo(
        "RNGYA2", "geography", "Gridded population maps",
        "Y. Chen, C. Xu, Y. Ge, X. Zhang, Y. Zhou (2024), A 100 m gridded population dataset of China's seventh census using ensemble learning and big geospatial data, Earth System Science Data 16, 3705–3718.",
        "https://essd.copernicus.org/articles/16/3705/2024/", "10.5194/essd-16-3705-2024",
        "Explore how census populations are distributed across geographic grid cells and the limits of these estimates.",
        [("Input data", "A census often reports populations by administrative units that differ in shape and area.", "Do two units with the same population necessarily have the same density?"),
         ("Allocate to a grid", "The authors combine census and geographic data with machine learning to create estimates on a 100 m grid.", "Is a grid cell a direct measurement or an estimate?"),
         ("Evaluation", "Results must be checked against reference data; errors can vary between regions.", "Why can a detailed map still be uncertain?")],
        [("What does a 100 m grid cell represent in the paper?", ["An estimate of spatial population distribution", "The exact location of every individual", "A direct count in every cell"], 0, "The grid cells are modeled allocations from census and geographic data."),
         ("Why evaluate errors?", ["The model estimates values and reliability varies", "Every map is perfectly accurate", "Because the map uses many colors"], 0, "High resolution does not guarantee perfect accuracy.")]),
    _make_demo(
        "RNENV3", "environment", "The global carbon budget",
        "P. Friedlingstein et al. (2023), Global Carbon Budget 2023, Earth System Science Data 15, 5301–5369.",
        "https://essd.copernicus.org/articles/15/5301/2023/", "10.5194/essd-15-5301-2023",
        "Explore how CO₂ emissions relate to atmospheric growth and uptake by land and oceans.",
        [("Emission sources", "The carbon budget combines emissions from fossil fuels and land-use change.", "Why consider multiple sources of emissions?"),
         ("Carbon sinks", "Oceans and land ecosystems absorb some carbon; another part increases atmospheric CO₂.", "What could happen if sinks weaken while emissions stay constant?"),
         ("Uncertainty and timing", "The paper reports historical data through 2022 and preliminary estimates for 2023; each component has uncertainty.", "Why shouldn't a 2023 estimate be called the latest data indefinitely?")],
        [("Where does emitted CO₂ go?", ["The atmosphere, oceans and land ecosystems", "Only the ocean", "Only inside factories"], 0, "The budget tracks several carbon sources and sinks."),
         ("How were 2023 values reported in this paper?", ["As preliminary estimates at publication", "As the latest data forever", "As direct measurements of every component"], 0, "Distinguish estimates from historical data and consider the publication year.")]),
    _make_demo(
        "RNENV2", "environment", "Tracking drought with gridded data",
        "S. H. Gebrechorkos et al. (2023), Global high-resolution drought indices for 1981–2022, Earth System Science Data 15, 5449–5466.",
        "https://essd.copernicus.org/articles/15/5449/2023/", "10.5194/essd-15-5449-2023",
        "Explore drought indices and how gridded data help examine changes across space and time.",
        [("Water balance", "Drought relates to precipitation and atmospheric evaporative demand; each index has its own definition.", "Does rainfall alone fully describe every kind of drought?"),
         ("Dataset", "The study constructs four SPEI index datasets on an approximately 5 km grid for 1981–2022.", "What do spatial resolution and time coverage tell us?"),
         ("Validation", "The datasets are compared with observation-based estimates and other indicators; quality can vary across places and times.", "Why compare against independent observations?")],
        [("What period does the study's dataset cover?", ["1981–2022", "All future years", "Only one day"], 0, "The dataset covers 1981–2022."),
         ("What is SPEI in this lesson?", ["An index for monitoring drought conditions", "A certain forecast map of the future", "A direct measurement of soil depth"], 0, "The index summarizes drought-related conditions according to its definition.")]),
]
