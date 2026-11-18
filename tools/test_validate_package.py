"""Regression tests for the documentation validator, not the future application."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import yaml
from validate_package import validate

ROOT = Path(__file__).resolve().parents[1]

class PackageValidatorTests(unittest.TestCase):
    def mutate_and_expect_failure(self, mutate, expected_check: str) -> None:
        with tempfile.TemporaryDirectory(prefix='firstscene-doc-check-') as directory:
            root = Path(directory) / 'package'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'node_modules', '.git', '.venv', 'apps', 'packages', 'dist'))
            mutate(root)
            result = validate(root, delivery=True)
            self.assertEqual(result['status'], 'FAIL', result)
            self.assertTrue(any(expected_check in e for e in result['errors']), result['errors'])

    @staticmethod
    def edit_json(root: Path, relative: str, mutate) -> None:
        file = root / relative
        value = json.loads(file.read_text(encoding='utf-8'))
        mutate(value)
        file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    def test_00_baseline_passes(self):
        result = validate(ROOT, delivery=False)
        self.assertEqual(result['status'], 'PASS', result['errors'])
        self.assertFalse(result['productExecuted'])

    def test_dependency_and_build_outputs_are_out_of_scope(self):
        with tempfile.TemporaryDirectory(prefix='firstscene-scope-') as directory:
            root = Path(directory) / 'package'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'node_modules', '.git', '.venv', 'apps', 'packages', 'dist'))
            dependency = root / 'node_modules' / 'unrelated'
            dependency.mkdir(parents=True)
            (dependency / 'broken.json').write_text('{not project JSON')
            (dependency / 'README.md').write_text('[external relative link](../../missing)')
            self.assertEqual(validate(root, delivery=True)['status'], 'PASS')

    def test_01_invalid_json_is_rejected(self):
        self.mutate_and_expect_failure(lambda r: (r/'examples/api/progress-write.json').write_text('{broken'), 'JSON/YAML syntax')

    def test_02_unrecognized_effect_is_rejected(self):
        def change(root):
            self.edit_json(root, 'examples/compiled/post-office.json', lambda x: x['scenes'][0]['beats'][0].update(effect='unbounded-shake'))
        self.mutate_and_expect_failure(change, 'Valid examples')

    def test_03_duplicate_beat_is_rejected(self):
        def change(root):
            self.edit_json(root,'examples/compiled/post-office.json',lambda x:x['scenes'][0]['beats'][1].update(id=x['scenes'][0]['beats'][0]['id']))
        self.mutate_and_expect_failure(change, 'Markdown')

    def test_04_asset_dependency_cycle_is_rejected(self):
        def change(root):
            f=root/'content/asset-plan.json';x=json.loads(f.read_text())
            # Find the schema's explicit dependency field instead of changing a prompt.
            assets=x['assets']
            a=assets[0]
            a['referenceIds']=[a['id']]
            f.write_text(json.dumps(x,ensure_ascii=False))
        self.mutate_and_expect_failure(change, 'Asset')

    def test_05_task_dependency_cycle_is_rejected(self):
        self.mutate_and_expect_failure(lambda r:self.edit_json(r,'execution/tasks.json',lambda x:x['tasks'][0]['dependencies'].append(x['tasks'][0]['id'])), 'Task dependency')

    def test_06_done_without_evidence_is_rejected(self):
        self.mutate_and_expect_failure(lambda r:self.edit_json(r,'execution/tasks.json',lambda x:x['tasks'][0].update(status='DONE', evidence=[], commit=None)), 'Task dependency')

    def test_07_inadequate_contrast_is_rejected(self):
        self.mutate_and_expect_failure(lambda r:self.edit_json(r,'design/tokens.json',lambda x:x['contrastPairs'][0].update(fg=x['contrastPairs'][0]['bg'])), 'Design token')

    def test_08_broken_local_link_is_rejected(self):
        self.mutate_and_expect_failure(lambda r:(r/'README.md').write_text((r/'README.md').read_text()+'\n[missing](missing-contract.md)\n'), 'Markdown local links')

    def test_09_openapi_reference_error_is_rejected(self):
        def change(root):
            f=root/'contracts/api.openapi.yaml';x=yaml.safe_load(f.read_text())
            x['components']['schemas']['Broken']={'$ref':'#/components/schemas/DoesNotExist'}
            f.write_text(yaml.safe_dump(x,allow_unicode=True,sort_keys=False))
        self.mutate_and_expect_failure(change, 'OpenAPI structure')

    def test_10_private_source_mutation_is_rejected(self):
        def change(root):
            meta=json.loads((root/'references/source-provenance.json').read_text());f=root/'references/private'/Path(meta['name']).name;f.write_bytes(f.read_bytes()+b'\nchanged\n')
        self.mutate_and_expect_failure(change, 'Private source document')

    def test_11_development_plan_drift_is_rejected(self):
        def change(root):
            f=root/'docs/06_DEVELOPMENT_PLAN.md';text=f.read_text();text=text.replace('### P00-T01 —','### P00-T99 —',1);f.write_text(text)
        self.mutate_and_expect_failure(change, 'Development plan')

    def test_12_missing_requirement_qa_is_rejected(self):
        def change(root):
            f=root/'contracts/qa-cases.yaml';x=yaml.safe_load(f.read_text());x['cases']=[c for c in x['cases'] if c['requirementId']!='R08'];f.write_text(yaml.safe_dump(x,allow_unicode=True,sort_keys=False))
        self.mutate_and_expect_failure(change, 'QA traceability')

    def test_13_story_source_drift_is_rejected(self):
        def change(root):
            f=root/'content/stories/post-office/story.md';text=f.read_text();text=text.replace(':::beat{', ':::beat{extra="unsupported" ',1);f.write_text(text)
        self.mutate_and_expect_failure(change, 'Markdown')

    def test_14_decorative_image_nonempty_alt_is_rejected(self):
        def change(root):
            self.edit_json(root, 'content/asset-plan.json', lambda x: x['assets'][0].update(alt='Must not be announced'))
        self.mutate_and_expect_failure(change, 'Valid examples')

    def test_15_delivery_mode_rejects_app_but_development_mode_allows_it(self):
        with tempfile.TemporaryDirectory(prefix='firstscene-scope-check-') as directory:
            root = Path(directory) / 'package'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'node_modules', '.git', '.venv', 'apps', 'packages', 'dist'))
            (root/'apps').mkdir()
            self.assertEqual(validate(root, delivery=True)['status'], 'FAIL')
            self.assertEqual(validate(root, delivery=False)['status'], 'PASS')

if __name__ == '__main__':
    unittest.main(verbosity=2)
