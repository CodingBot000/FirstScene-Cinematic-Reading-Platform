#!/usr/bin/env python3
"""Validate the documentation package, not the future FirstScene application.

Dependencies: Python 3.10+, PyYAML, jsonschema. No network, paid calls or DB access.
The small authoring-fixture parser here checks the supplied constrained samples;
it is not the production Markdown compiler or a replacement for security tests.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote
from typing import Any
try:
    import yaml
    import jsonschema
except ImportError as exc:
    raise SystemExit('Install document-check dependencies: python -m pip install -r tools/requirements.txt') from exc


def sha(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()


def canonical_story(value: dict[str, Any]) -> str:
    body = copy.deepcopy(value)
    body.pop('contentHash', None)
    return sha(body)


def parse_fixture_markdown(text: str) -> dict[str, Any]:
    text = unicodedata.normalize('NFC', text.replace('\r\n', '\n')).lstrip('\ufeff')
    chunks = text.split('---\n', 2)
    if len(chunks) != 3 or chunks[0].strip():
        raise ValueError('front matter is missing')
    story = yaml.safe_load(chunks[1])
    story['scenes'] = []
    scene = None
    beat_attrs = None
    body: list[str] = []
    for line in chunks[2].splitlines():
        if line.startswith('::::scene{'):
            if scene is not None or beat_attrs is not None:
                raise ValueError('nested scene')
            attrs = dict(re.findall(r'([A-Za-z]+)="([^"]*)"', line))
            if set(attrs) - {'id', 'title', 'background', 'mood', 'portrait'}:
                raise ValueError('unknown scene attribute')
            scene = {'id': attrs['id'], 'title': attrs['title'], 'backgroundAssetId': attrs['background'],
                     'portraitAssetId': attrs.get('portrait'), 'mood': attrs['mood'], 'beats': []}
        elif line.startswith(':::beat{'):
            if scene is None or beat_attrs is not None:
                raise ValueError('beat outside scene or nested beat')
            beat_attrs = dict(re.findall(r'([A-Za-z]+)="([^"]*)"', line))
            if set(beat_attrs) - {'id', 'kind', 'speaker', 'mood', 'effect'}:
                raise ValueError('unknown beat attribute')
            body = []
        elif line == ':::':
            if scene is None or beat_attrs is None:
                raise ValueError('unbalanced beat close')
            value = '\n'.join(body).strip()
            if not value or '<' in value or '>' in value or '```' in value:
                raise ValueError('unsupported or unsafe body')
            scene['beats'].append({'id': beat_attrs['id'], 'kind': beat_attrs.get('kind', 'narration'),
                'speaker': beat_attrs.get('speaker'), 'text': value, 'mood': beat_attrs.get('mood', scene['mood']),
                'effect': beat_attrs.get('effect', 'none')})
            beat_attrs = None
        elif line == '::::':
            if scene is None or beat_attrs is not None:
                raise ValueError('unbalanced scene close')
            story['scenes'].append(scene)
            scene = None
        elif beat_attrs is not None:
            body.append(line)
        elif line.strip():
            raise ValueError('content outside permitted blocks')
    if scene is not None or beat_attrs is not None:
        raise ValueError('unclosed container')
    story['contentHash'] = canonical_story(story)
    return story


def story_issues(story: dict[str, Any], assets: dict[str, dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    if len(story.get('scenes', [])) != 6:
        issues.append('expected exactly six launch scenes')
    ids: set[str] = set()
    chars = {c['id'] for c in story.get('characters', [])}
    if len(chars) != len(story.get('characters', [])):
        issues.append('duplicate character')
    highlights = 0
    cover = assets.get(story.get('coverAssetId'))
    if not cover or cover['role'] != 'cover' or cover['storyId'] != story['id']:
        issues.append('invalid cover')
    for scene in story.get('scenes', []):
        if scene['id'] in ids:
            issues.append('duplicate scene')
        ids.add(scene['id'])
        bg = assets.get(scene['backgroundAssetId'])
        if not bg or bg['role'] != 'background' or bg['sceneId'] != scene['id'] or bg['storyId'] != story['id']:
            issues.append('invalid background reference')
        if scene['portraitAssetId']:
            portrait = assets.get(scene['portraitAssetId'])
            if not portrait or portrait['role'] != 'portrait' or portrait['storyId'] != story['id']:
                issues.append('invalid portrait reference')
        if len(scene['beats']) != 6:
            issues.append('expected six launch beats per scene')
        for beat in scene['beats']:
            if beat['id'] in ids:
                issues.append('duplicate beat')
            ids.add(beat['id'])
            if beat['kind'] == 'dialogue' and beat['speaker'] not in chars:
                issues.append('unknown dialogue speaker')
            if beat['kind'] == 'narration' and beat['speaker'] is not None:
                issues.append('narration speaker must be null')
            if beat['effect'] != 'none':
                highlights += 1
                # Launch texts contain NFC Korean and basic punctuation. JS runtime
                # must separately test Intl.Segmenter grapheme semantics for emoji.
                if len(beat['text']) > 120:
                    issues.append('highlight exceeds launch bound')
    if highlights > 4:
        issues.append('too many highlights')
    if story.get('contentHash') != canonical_story(story):
        issues.append('content hash mismatch')
    return issues


def dag_errors(graph: dict[str, list[str]]) -> list[str]:
    errors: list[str] = []
    visiting: set[str] = set()
    done: set[str] = set()
    def visit(key: str) -> None:
        if key in visiting:
            errors.append(f'cycle at {key}')
            return
        if key in done:
            return
        visiting.add(key)
        for dep in graph[key]:
            if dep not in graph:
                errors.append(f'missing dependency {key}->{dep}')
            else:
                visit(dep)
        visiting.remove(key)
        done.add(key)
    for key in graph:
        visit(key)
    return errors


def luminance(color: str) -> float:
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb]
    return .2126*linear[0] + .7152*linear[1] + .0722*linear[2]


def pointer(document: Any, path: str) -> Any:
    if not path.startswith('#/'):
        raise ValueError('external ref not permitted in portable API contract')
    value = document
    for part in path[2:].split('/'):
        key = part.replace('~1', '/').replace('~0', '~')
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def package_files(root: Path):
    """Inspect project-owned files, never third-party installs or build outputs."""
    excluded = {'node_modules', '.git', '.venv', '.next', 'dist', '__pycache__', 'coverage', 'test-results', 'playwright-report'}
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = [name for name in dirs if name not in excluded and not (Path(directory) / name).is_symlink()]
        for name in files:
            path = Path(directory) / name
            if not path.is_symlink():
                yield path


def validate(root: Path, delivery: bool = False) -> dict[str, Any]:
    root = root.resolve()
    checks: list[dict[str, Any]] = []
    errors: list[str] = []
    metrics: dict[str, Any] = {}
    def run(name: str, operation) -> None:
        try:
            detail = operation()
            checks.append({'name': name, 'status': 'PASS', 'detail': detail})
        except Exception as exc:
            message = f'{name}: {type(exc).__name__}: {exc}'
            checks.append({'name': name, 'status': 'FAIL', 'detail': str(exc)})
            errors.append(message)
    def read(name: str):
        return json.loads((root / name).read_text(encoding='utf-8'))
    def require(condition: bool, message: str) -> None:
        if not condition:
            raise ValueError(message)
    def check_parse():
        paths = [p for p in package_files(root) if p.suffix in {'.json', '.jsonl', '.yaml', '.yml'}]
        count = 0
        for p in paths:
            if p.suffix == '.json':
                json.loads(p.read_text())
            elif p.suffix == '.jsonl':
                for line in p.read_text().splitlines():
                    if line.strip(): json.loads(line)
            else:
                yaml.safe_load(p.read_text())
            count += 1
        metrics['parsedStructuredFiles'] = count
        return count
    run('JSON/YAML syntax', check_parse)
    def check_schemas():
        for p in (root / 'contracts').glob('*.schema.json'):
            jsonschema.Draft202012Validator.check_schema(json.loads(p.read_text()))
        return len(list((root/'contracts').glob('*.schema.json')))
    run('JSON Schema meta validation', check_schemas)
    def schema_sample():
        pairs = [('contracts/asset-plan.schema.json','content/asset-plan.json'),
                 ('contracts/execution-state.schema.json','execution/tasks.json'),
                 ('contracts/asset-manifest.schema.json','examples/asset-manifest.empty.json')]
        pairs += [('contracts/story.schema.json',str(p.relative_to(root))) for p in (root/'examples/compiled').glob('*.json')]
        for schema, sample in pairs:
            jsonschema.Draft202012Validator(read(schema), format_checker=jsonschema.FormatChecker()).validate(read(sample))
        return len(pairs)
    run('Valid examples against schemas', schema_sample)
    def check_content():
        assets = {a['id']:a for a in read('content/asset-plan.json')['assets']}
        total_scenes=total_beats=chars=0
        for p in (root/'content/stories').glob('*/story.md'):
            expected = read(f'examples/compiled/{p.parent.name}.json')
            parsed = parse_fixture_markdown(p.read_text())
            require(parsed == expected, f'Markdown/JSON drift: {p.parent.name}')
            issues = story_issues(expected, assets)
            require(not issues, f'{p.parent.name}: {issues}')
            total_scenes += len(expected['scenes'])
            total_beats += sum(len(s['beats']) for s in expected['scenes'])
            chars += sum(len(b['text']) for s in expected['scenes'] for b in s['beats'])
        require(total_scenes == 12 and total_beats == 72, 'launch content count mismatch')
        metrics.update(stories=2,scenes=total_scenes,beats=total_beats,storyCharacters=chars)
        return {'scenes':total_scenes,'beats':total_beats,'characters':chars}
    run('Markdown parity, content hashes, IDs and launch semantics', check_content)
    def negatives():
        assets = {a['id']:a for a in read('content/asset-plan.json')['assets']}
        v=jsonschema.Draft202012Validator(read('contracts/story.schema.json'))
        count=0
        for p in (root/'examples/invalid').glob('*.json'):
            d=json.loads(p.read_text())
            issues=list(v.iter_errors(d))+story_issues(d,assets)
            require(bool(issues),f'negative fixture unexpectedly accepted: {p.name}')
            count+=1
        try:
            parse_fixture_markdown((root/'examples/invalid/unsafe-story.md').read_text())
        except Exception:
            count+=1
        else:
            raise ValueError('unsafe fixture accepted')
        metrics['negativeFixturesRejected']=count
        return count
    run('Intentional negative fixtures rejected', negatives)
    def check_assets():
        plan=read('content/asset-plan.json'); assets=plan['assets']; ids=[a['id'] for a in assets]
        require(len(ids)==len(set(ids)),'duplicate asset IDs')
        require(len(assets)==18,'asset count must be 18')
        require(sum(a['method']=='generate' for a in assets)==16,'generated source count must be16')
        require(sum(a['role']!='reference' for a in assets)==16,'public asset count must be16')
        require(plan['apiBudgetUsd']==0,'unapproved paid budget in initial package')
        graph={a['id']:a['referenceIds']+([a['derivedFrom']] if a['derivedFrom'] else []) for a in assets}
        issues=dag_errors(graph);require(not issues,str(issues))
        for a in assets:
            prompt_path=root/f'content/prompts/{a["id"]}.md'
            require(prompt_path.exists(),f'missing prompt {a["id"]}')
            require(a['prompt'] in prompt_path.read_text(),f'prompt drift {a["id"]}')
            require(a['status']=='PLANNED','initial plan must not claim generated assets')
            require(a['method']!='derive' or a['derivedFrom'] is not None,'derive source missing')
        metrics.update(assetPlanEntries=18,generationSources=16,publicAssetsRequired=16)
        return {'entries':18,'sources':16,'public':16}
    run('Asset plan DAG, prompts and billing default', check_assets)
    def check_tasks():
        data=read('execution/tasks.json'); tasks=data['tasks']; byid={t['id']:t for t in tasks}
        require(len(byid)==len(tasks),'duplicate task IDs')
        issues=dag_errors({t['id']:t['dependencies'] for t in tasks}); require(not issues,str(issues))
        commands={c['id'] for c in read('contracts/command-catalog.json')['commands']}
        reqs=set()
        for t in tasks:
            require(set(t['commandIds'])<=commands,f'unknown command {t["id"]}')
            require(len(t['acceptance'])>=3 and bool(t['outputs']),f'incomplete task {t["id"]}')
            if t['gate']=='local':
                require(all(byid[d]['gate']=='local' for d in t['dependencies']),f'local gate depends on public {t["id"]}')
            reqs.update(t['requirementIds'])
            if t['status']=='DONE':
                require(t['evidence'] and t['commit'],f'unsupported DONE {t["id"]}')
                for evidence in t['evidence']:
                    ep=(root/evidence).resolve()
                    require(ep.is_relative_to(root) and ep.is_file(),f'evidence missing {t["id"]}')
                require(all(byid[d]['status']=='DONE' for d in t['dependencies']),f'DONE before dependency {t["id"]}')
            if t['status']=='BLOCKED_EXTERNAL':
                require(bool(t['blockers']),f'blocker detail missing {t["id"]}')
        require(reqs=={f'R{i:02d}' for i in range(1,14)},'requirements not fully covered')
        if data['status']=='NOT_STARTED':
            require(all(t['status']=='PENDING' for t in tasks),'NOT_STARTED ledger mismatch')
        metrics.update(tasks=len(tasks),localTasks=sum(t['gate']=='local' for t in tasks),publicTasks=sum(t['gate']=='public' for t in tasks))
        return {'tasks':len(tasks),'local':metrics['localTasks'],'public':metrics['publicTasks']}
    run('Task dependency DAG, acceptance, evidence and R01-R13 coverage', check_tasks)
    def plan_parity():
        tasks=read('execution/tasks.json')['tasks']; plan=(root/'docs/06_DEVELOPMENT_PLAN.md').read_text()
        heading_ids=re.findall(r'^### (P\d\d-T\d\d) —',plan,re.M)
        require(heading_ids==[t['id'] for t in tasks],'plan/task ID order drift')
        for t in tasks:
            require(t['title'] in plan,f'task title drift {t["id"]}')
            for text in t['acceptance']:require(text in plan,f'acceptance drift {t["id"]}')
        if read('execution/tasks.json')['status']=='NOT_STARTED':
            summary=(root/'PROGRESS.md').read_text()
            require(f'0 / {len(tasks)}' in summary,'initial progress count mismatch')
        return len(heading_ids)
    run('Development plan and progress parity', plan_parity)
    def qa_coverage():
        cases=yaml.safe_load((root/'contracts/qa-cases.yaml').read_text())['cases']
        ids={c['id'] for c in cases};tasks={t['id'] for t in read('execution/tasks.json')['tasks']}
        require(len(ids)==len(cases),'duplicate QA ID')
        for c in cases:
            require(c['taskId'] in tasks,f'QA unknown task {c["id"]}')
            require(all(c.get(k) for k in ['precondition','action','expected','severity','requirementId']),f'QA missing field {c["id"]}')
        require({c['requirementId'] for c in cases}=={f'R{i:02d}' for i in range(1,14)},'QA requirements not fully covered')
        metrics['qaCases']=len(cases)
        return len(cases)
    run('QA traceability and coverage',qa_coverage)
    def package_graph():
        graph=read('contracts/package-boundaries.json')['allowedInternalDependencies'];issues=dag_errors(graph)
        require(not issues,str(issues));require('next' not in graph.get('ui',[]),'UI must not depend on Next')
        return len(graph)
    run('Package dependency DAG',package_graph)
    def colors():
        results=[]
        for pair in read('design/tokens.json')['contrastPairs']:
            a,b=luminance(pair['fg']),luminance(pair['bg']);ratio=(max(a,b)+.05)/(min(a,b)+.05)
            require(ratio>=pair['minimum'],f'{pair["name"]} contrast {ratio:.2f} < {pair["minimum"]}')
            results.append({'name':pair['name'],'ratio':round(ratio,3)})
        metrics['contrastPairs']=results
        return results
    run('Design token text contrast calculations', colors)
    def components():
        d=yaml.safe_load((root/'design/components.yaml').read_text()); names=[x['name'] for x in d['components']]
        require(len(names)==16 and len(set(names))==16,'component count or uniqueness')
        for c in d['components']:require(c['a11y'] and c['props'] and c['storybookRequired'],'component contract incomplete')
        metrics['components']=len(names);return len(names)
    run('Component public contracts',components)
    def api_check():
        d=yaml.safe_load((root/'contracts/api.openapi.yaml').read_text())
        require(d['openapi']=='3.1.0','OpenAPI version')
        ids=[]
        for route,path in d['paths'].items():
            for method,op in path.items():
                require(method in {'get','post','put','delete','patch'},'bad method')
                ids.append(op['operationId'])
                variables=set(re.findall(r'{([^}]+)}',route))
                declared={p['name'] for p in op.get('parameters',[]) if p['in']=='path'}
                require(variables==declared,f'path param mismatch {route}')
                require(any(x.startswith('2') for x in op['responses']),f'no success {route}')
                if method in {'post','put','delete','patch'}:require('requestBody'in op,f'no explicit JSON write body {route}')
        require(len(ids)==len(set(ids)),'duplicate operationId')
        for node in walk(d):
            if '$ref' in node:pointer(d,node['$ref'])
        for name,schema in d['components']['schemas'].items():jsonschema.Draft202012Validator.check_schema(schema)
        for file,name in [('progress-write','ProgressWrite'),('preferences-write','PreferencesWrite')]:
            schema={'$ref':f'#/components/schemas/{name}','components':d['components']}
            jsonschema.Draft202012Validator(schema,format_checker=jsonschema.FormatChecker()).validate(read(f'examples/api/{file}.json'))
        require(read('examples/api/progress-write.json')['contentHash']==read('examples/compiled/post-office.json')['contentHash'],'API sample content hash drift')
        metrics.update(apiPaths=len(d['paths']),apiOperations=len(ids))
        return {'paths':len(d['paths']),'operations':len(ids),'note':'Structural/ref/schema checks, not full OAS meta-schema validation'}
    run('OpenAPI structure, local refs, schemas and request samples',api_check)
    def sql_check():
        text=(root/'database/0001_initial.sql').read_text();tables=re.findall(r'CREATE TABLE firstscene\.([a-z_]+)',text)
        expected={'schema_migrations','sessions','preferences','reading_progress','bookmarks','mutation_receipts','feedback','rate_buckets'}
        require(set(tables)==expected and len(tables)==8,'migration table inventory mismatch')
        require('ON DELETE CASCADE' in text and 'REVOKE ALL' in text,'missing ownership controls')
        require('DROP ' not in text.upper(),'destructive reference migration')
        metrics['sqlTables']=len(tables)
        return {'tables':len(tables),'note':'Inventory checks only; no PostgreSQL parser or database execution'}
    run('SQL reference inventory and non-destructive baseline',sql_check)
    def source_hash():
        meta=read('references/source-provenance.json');p=root/'references/private'/Path(meta['name']).name
        require(hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256'],'provided private source mutated')
        require('/references/' in (root/'.gitignore').read_text(),'private source not ignored')
        return meta['sha256']
    run('Private source document preserved byte-for-byte',source_hash)
    def links():
        total=0
        for p in package_files(root):
            if p.suffix != '.md': continue
            if 'references/private' in str(p):continue
            text=p.read_text()
            for target in re.findall(r'\]\(([^\s)]+)(?:\s+[^)]*)?\)',text):
                if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) or target.startswith('#'):continue
                target=unquote(target.split('#',1)[0])
                if not target:continue
                dest=(p.parent/target).resolve()
                require(dest.is_relative_to(root),f'local link escapes package: {p.name} {target}')
                require(dest.exists(),f'broken local link: {p.relative_to(root)} -> {target}')
                total+=1
        metrics['localLinks']=total;return total
    run('Markdown local links',links)
    def required_files():
        required=['README.md','AGENTS.md','CODEX_START.md','PROGRESS.md','WORK_LOG.md','RESUME.md']
        required += [f'docs/{name}' for name in ['00_MASTER_SPEC.md','01_PRD_UX_IA.md','02_DESIGN_SYSTEM.md','03_ARCHITECTURE.md','04_STORY_READER.md','05_CONTENT_ASSETS.md','06_DEVELOPMENT_PLAN.md','07_QA_ACCESSIBILITY_PERFORMANCE.md','08_DATABASE_DEPLOYMENT_CICD.md','09_PORTFOLIO_MAPPING.md','10_ADR.md','11_SECURITY_OPERATIONS.md','12_FINAL_REVIEW.md','13_VERIFICATION_REPORT.md','14_SOURCES.md','15_COMMAND_CATALOG.md','16_SCREEN_SPECS.md','17_SELF_REVIEW_AND_FIXES.md']]
        for file in required:require((root/file).is_file(),f'missing {file}')
        # A documentation pack must not quietly turn into a built/deployed application.
        if delivery:
            require(not (root/'apps').exists(),'actual app source unexpected in documentation delivery')
        fontfiles=[p for p in package_files(root) if p.suffix.lower() in {'.ttf','.otf','.woff','.woff2'}]
        if delivery:
            require(not fontfiles,'font binary distribution forbidden in delivered pack')
        return len(required)
    run('Required deliverables, docs-only scope, no font binaries',required_files)
    metrics['fileCountAtValidation']=sum(p.is_file() for p in package_files(root))
    return {'scope':'documentation-package-only','deliveryCheck':delivery,'productExecuted':False,'status':'PASS' if not errors else 'FAIL','checks':checks,'errors':errors,'metrics':metrics,
            'notExecuted':['Web application build/tests','PostgreSQL migration execution','Image generation/optimization','Browser visual/a11y/performance QA','Public deployment','Full OpenAPI meta-schema validator','PostgreSQL SQL parser'],
            'dependencyNote':'PyYAML/jsonschema were available. Additional OpenAPI/SQL validator installation failed due to network name resolution; no success is claimed for those tools.'}


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--report',type=Path)
    parser.add_argument('--delivery',action='store_true',help='Also enforce documentation-only delivery and no font binaries')
    args=parser.parse_args()
    result=validate(args.root, delivery=args.delivery)
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':result['status'],'checks':len(result['checks']),'errors':result['errors'],'metrics':result['metrics']},ensure_ascii=False,indent=2))
    return 0 if result['status']=='PASS' else 1

if __name__=='__main__':
    raise SystemExit(main())
