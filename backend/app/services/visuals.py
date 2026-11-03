"""Allowlisted educational scenes. Selection never executes generated 3D code."""
import json
import re
import unicodedata
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[3] / 'shared' / 'visual_catalog.json').read_text(encoding='utf-8'))
BY_ID = {item['id']: item for item in CATALOG}
CONTROLS = {
    'agriculture_field': 'choose flooded / draining / drained water stage, row or scattered planting layout, rice or maize crop structure, and show root-zone microorganism symbols. No yield, irrigation prescription or emission prediction',
    'reaction_diffusion': 'set dimensionless diffusion coefficient; enable A+B->2B autocatalysis and B->C removal; advance numerical steps or reset the same initial state; compare linked 3D height and 2D concentrations. This closed teaching system is not the paper’s sustained thiol waves or kinetic model',
    'porous_adsorption': 'manually assign a number of illustrative CO2 and H2O surface sites; lift the molecules off the surface. Counts are user-chosen, not predicted adsorption capacity, isotherms or a competitive adsorption law',
    'semiconductor_chip': 'choose device, CMOS inverter, chip stack or memristor; compare planar/nanosheet/nanowire device structures; change the idealized gate state, predict then reveal CMOS output, separate layers, or inspect qualitative memory states. These teaching models do not reproduce device dimensions, switching curves or measured paper results',
    'circulation': 'whole heart / ventricular cavities / major vessels; rotate; blood-path steps',
    'enzyme_binding': 'number of substrate symbols; approach / binding / release; rotate',
    'molecular_geometry': 'choose H2O / CO2 / CH4; rotate; observe the labelled bond angle',
    'solar_globe': 'latitude; longitude; day of year; local solar hour',
    'water_cycle': 'choose evaporation / condensation / precipitation / runoff / infiltration stages; rotate',
    'population_grid': 'height scale; rotate; unchanged underlying illustrative cell values',
    'image_relief': 'choose pixel row and column; compare input intensity and output after a mean filter',
    'data_tree': 'advance or rewind breadth-first traversal; compare current and visited nodes',
    'quadrotor': 'adjust tilt and thrust; compare vertical and horizontal components of the thrust vector',
    'solar_cell': 'separate the layers; inspect a schematic cracked region; compare structural views only',
    'diffusion_process': 'adjust alpha-bar (retained signal); redraw a seeded Gaussian noise sample; inspect pixel intensities and the 3D relief. The reverse slider movement is not learned denoising',
}


def suggest_visual(text: str) -> str | None:
    text = unicodedata.normalize('NFKC', text).casefold()
    if text.strip() in {'h2o', 'co2', 'ch4'}:
        return 'molecular_geometry'
    matches = [item['id'] for item in CATALOG if any(
        re.search(r'(?<!\w)' + re.escape(unicodedata.normalize('NFKC', word).casefold()) + r'(?!\w)', text)
        for word in item['keywords'])]
    # An ambiguous source deserves a teacher choice, rather than an arbitrary first match.
    return matches[0] if len(matches) == 1 else None


def visual_task(kind: str, language: str) -> str:
    item = BY_ID[kind]
    lang = 'en' if language == 'en' else 'vi'
    return (
        '\nThe teacher selected the built-in interactive: ' + item['name']['en'] + '. '
        'Write a short teaching introduction grounded in the reviewed analysis: what to observe, '
        'one prediction, one action using these controls, and one comparison after acting: ' + CONTROLS[kind] + '. '
        'Do not invent controls, experimental results, or claim to reconstruct the source image. '
        'Explain this limitation in the lesson language: ' + item['scope'][lang]
    )
