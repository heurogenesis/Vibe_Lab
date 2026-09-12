import { describe, expect, it } from 'vitest';
import { goalIntents, hasRoleSignal, languages, resolveGoalIntent, resolveRole, roles } from '../shared/taxonomy.js';
import { disciplines, listExercises, profileSignature, recommendation, themes } from '../shared/catalog.js';
import { defaultProfile, type Profile } from '../shared/schema.js';
import { generateRules } from '../server/curriculum.js';

const withProfile = (over: Partial<Profile>): Profile => ({ ...defaultProfile, ...over });

describe('free text is classified into bounded categories', () => {
  it('maps job titles to a role, and falls back deliberately', () => {
    const cases: [string, string][] = [
      ['공정설계', 'process'], ['품질 엔지니어', 'quality'], ['연구개발', 'research'],
      ['설비 유지보수', 'operation'], ['프로젝트 기획', 'planning'], ['대학생', 'student'],
      ['강의 조교', 'teaching'], ['회로 설계', 'design'], ['바리스타', 'general'],
    ];
    for (const [text, expected] of cases) expect(resolveRole({ role: text }).id, text).toBe(expected);
  });
  it('lets an explicit choice win over the typed job title', () => {
    expect(resolveRole({ role: '공정설계', roleId: 'quality' }).id).toBe('quality');
    // 'general' is not an explicit choice: it means "classify for me".
    expect(resolveRole({ role: '공정설계', roleId: 'general' }).id).toBe('process');
  });
  it('uses the goal only to break a tie the job title could not settle', () => {
    expect(resolveRole({ role: '사원', goal: '실험 데이터를 정리하고 싶어요' }).id).toBe('research');
    expect(resolveRole({ role: '품질 엔지니어', goal: '프로젝트 일정을 관리하고 싶어요' }).id).toBe('quality');
  });
  it('keeps a secondary signal available for extra tracks', () => {
    expect(resolveRole({ role: '연구개발 및 PM' }).id).toBe('research');
    expect(hasRoleSignal('연구개발 및 PM', 'planning')).toBe(true);
    expect(hasRoleSignal('품질 엔지니어', 'planning')).toBe(false);
  });
  it('classifies the goal sentence into an intent', () => {
    expect(resolveGoalIntent('반복되는 업무를 자동화하고 싶어요').id).toBe('automate');
    expect(resolveGoalIntent('측정값을 비교해서 원인을 찾고 싶어요').id).toBe('analyze');
    expect(resolveGoalIntent('결과를 대시보드로 보고하고 싶어요').id).toBe('report');
    expect(resolveGoalIntent('설명할 수 없는 문장').id).toBe('understand');
  });
});

describe('profile signature', () => {
  it('gives the same content key to the same background written differently', () => {
    const a = profileSignature(withProfile({ major: '화학공학', role: '공정 엔지니어', goal: '수율을 올리고 싶어요' }));
    const b = profileSignature(withProfile({ major: '화학공학과 졸업', role: '제조 공정 담당', goal: '생산 데이터를 자동으로 정리하고 싶어요' }));
    expect(a.contentKey).toBe(b.contentKey);
  });
  it('changes the content key when the role changes', () => {
    const base = { major: '화학공학', goal: '데이터를 정리하고 싶어요' };
    const process = profileSignature(withProfile({ ...base, role: '공정 엔지니어' }));
    const quality = profileSignature(withProfile({ ...base, role: '품질 엔지니어' }));
    expect(process.contentKey).not.toBe(quality.contentKey);
  });
  it('keeps presentation-only dimensions out of the content key', () => {
    const base = { major: '화학공학', role: '공정 엔지니어', goal: '수율을 올리고 싶어요' };
    const beginner = profileSignature(withProfile({ ...base, level: 'beginner', style: 'guided' }));
    const advanced = profileSignature(withProfile({ ...base, level: 'advanced', style: 'concept-first' }));
    expect(beginner.contentKey).toBe(advanced.contentKey);
    expect(beginner.renderKey).not.toBe(advanced.renderKey);
  });
  it('never puts the learner的 own sentences in either key', () => {
    const secret = '사내 A라인 수율이 72%라서 고민입니다';
    const signature = profileSignature(withProfile({ major: '화학공학', role: '공정 엔지니어', goal: secret }));
    expect(signature.contentKey).not.toContain('수율');
    expect(signature.renderKey).not.toContain('수율');
    expect(signature.contentKey.split(':')).toHaveLength(4);
  });
  it('stays inside a bounded, enumerable space no matter how many learners exist', () => {
    const possible = new Set<string>();
    for (const d of disciplines) for (const r of roles) for (const t of themes) for (const l of languages) possible.add(`${d.id}:${r.id}:${t.id}:${l.id}`);
    expect(possible.size).toBe(disciplines.length * roles.length * themes.length * languages.length);
    // Small enough that the whole space can still be generated ahead of time for a few dollars.
    expect(possible.size).toBeLessThanOrEqual(4000);
    const samples = [
      withProfile({ major: '전자공학', role: '회로 설계' }),
      withProfile({ major: '기계공학', role: '설비 유지보수', level: 'advanced' }),
      withProfile({ major: '화학', role: '품질 분석', interests: ['quality'] }),
      withProfile({ major: '알 수 없는 전공', role: '알 수 없는 직무' }),
    ];
    for (const profile of samples) expect(possible.has(profileSignature(profile).contentKey)).toBe(true);
  });
});

describe('generated content follows the category, not the wording', () => {
  it('produces different lessons for the same major with different roles', () => {
    const base = { major: '화학공학', domain: 'data' as const, goal: '데이터를 정리하고 싶어요' };
    const process = generateRules(withProfile({ ...base, role: '공정 엔지니어' }), []);
    const quality = generateRules(withProfile({ ...base, role: '품질 엔지니어' }), []);
    expect(process.summary).not.toBe(quality.summary);
    expect(process.lessons.map(l => l.title)).not.toEqual(quality.lessons.map(l => l.title));
  });
  it('explains the recommendation with the resolved category', () => {
    const plan = recommendation(withProfile({ major: '화학공학', role: '품질 엔지니어' }));
    expect(plan.role.id).toBe('quality');
    expect(plan.reason).toContain('품질·분석');
    expect(plan.reason).toContain(plan.discipline.label);
  });
  it('adds the project track for a planning signal without changing the field', () => {
    const plan = recommendation(withProfile({ major: '전자공학', role: '연구개발 및 PM' }));
    expect(plan.discipline.id).toBe('electronics');
    expect(plan.exerciseIds).toContain('project:compare');
  });
});

describe('expanding the catalog', () => {
  it('generates four executable exercises per discipline', () => {
    expect(listExercises().length).toBe((disciplines.length + 1) * themes.length);
  });
  it('keeps the fallback entries last so unmatched input lands there deliberately', () => {
    expect(disciplines[disciplines.length - 1].id).toBe('general');
    expect(roles[roles.length - 1].id).toBe('general');
  });
  it('routes a business major to its own field rather than the generic fallback', () => {
    expect(profileSignature(withProfile({ major: '경영학', role: '기획' })).discipline.id).toBe('business');
    expect(profileSignature(withProfile({ major: '반도체공학', role: '공정' })).discipline.id).toBe('semiconductor');
    expect(profileSignature(withProfile({ major: '자동차공학', role: '설계' })).discipline.id).toBe('automotive');
  });
});

describe('vibe coding dimensions', () => {
  it('treats the language as part of the material, not as styling', () => {
    const base = { major: '화학공학', role: '공정 엔지니어' };
    const ts = profileSignature(withProfile({ ...base, languageId: 'typescript' }));
    const py = profileSignature(withProfile({ ...base, languageId: 'python' }));
    expect(ts.contentKey).not.toBe(py.contentKey);
    expect(py.language.label).toBe('Python');
  });
  it('is honest about which languages the sandbox can actually run', () => {
    expect(languages.find(l => l.id === 'typescript')?.executable).toBe(true);
    expect(languages.find(l => l.id === 'python')?.executable).toBe(false);
    // A learner who picked Python must be told the graded run is still TypeScript.
    const curriculum = generateRules(withProfile({ major: '화학공학', role: '공정 엔지니어', languageId: 'python' }), []);
    expect(curriculum.rationale).toContain('TypeScript');
  });
  it('falls back instead of failing on an unknown id', () => {
    const signature = profileSignature(withProfile({ languageId: 'cobol', outputTargetId: 'hologram', promptSkillId: 'wizard' }));
    expect(signature.language.id).toBe('typescript');
    expect(signature.outputTarget.id).toBe('script');
    expect(signature.promptSkill.id).toBe('some');
  });
  it('closes the last lesson with the output the learner wants', () => {
    const curriculum = generateRules(withProfile({ major: '화학공학', role: '공정 엔지니어', outputTargetId: 'dashboard' }), []);
    expect(curriculum.lessons[curriculum.lessons.length - 1].experiment).toContain('대시보드');
    expect(curriculum.lessons[0].experiment).not.toContain('대시보드');
  });
  it('adapts the coaching to how much AI the learner has used', () => {
    const novice = generateRules(withProfile({ major: '화학공학', role: '공정 엔지니어', promptSkillId: 'none' }), []);
    const fluent = generateRules(withProfile({ major: '화학공학', role: '공정 엔지니어', promptSkillId: 'fluent' }), []);
    expect(novice.rationale).not.toBe(fluent.rationale);
  });
});

describe('goal intents', () => {
  it('every intent has framing text the curriculum can use', () => {
    for (const intent of goalIntents) expect(intent.framing.length).toBeGreaterThan(10);
  });
});
