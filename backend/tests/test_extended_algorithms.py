import pytest

from app.services import generation
from app.schemas.spec import LabSpec


@pytest.mark.parametrize('kind', ['quick_sort', 'merge_sort', 'heap_sort', 'counting_sort', 'radix_sort', 'bucket_sort', 'linear_search'])
def test_algorithm_blocks_support_new_kinds_and_preserve_inputs(kind):
    out = generation.GenAlgorithm.model_validate({
        'title': 'Example', 'description': '', 'ref_ids': [], 'tokens': [],
        'Q': [], 'K': [], 'V': [], 'explanation': '', 'algorithm': kind,
        'array': [9, 3, 3, 12, 7], 'target': 3,
    })
    basis = generation.LessonBasis(analysis=generation.LabAnalysis(), digest={})
    block = generation.build_algorithm_block(out, kind, basis, 'en')
    assert block['algorithm'] == kind
    assert block['config']['array'] == [9, 3, 3, 12, 7]
    if kind == 'linear_search':
        assert block['config']['target'] == 3
    assert LabSpec.model_validate({'blocks': [block]}).blocks[0].algorithm == kind


@pytest.mark.parametrize(('kind', 'array'), [
    ('counting_sort', [0, 1, 101]),
    ('counting_sort', [0, 1.5, 2]),
    ('radix_sort', [0, 2.5, 3]),
    ('radix_sort', [0, 2, 1_000_001]),
    ('bucket_sort', [0, 2, 1_000_001]),
])
def test_integer_sorts_do_not_silently_round_or_allocate_unbounded_bins(kind, array):
    out = generation.GenAlgorithm.model_validate({
        'title': 'Example', 'description': '', 'ref_ids': [], 'tokens': [],
        'Q': [], 'K': [], 'V': [], 'explanation': '', 'algorithm': kind,
        'array': array, 'target': None,
    })
    basis = generation.LessonBasis(analysis=generation.LabAnalysis(), digest={})
    assert generation.build_algorithm_block(out, kind, basis, 'en') is None
