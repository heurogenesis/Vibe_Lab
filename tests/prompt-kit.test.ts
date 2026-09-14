import { describe, expect, it } from 'vitest';
import { getExercise } from '../shared/catalog.js';
import { defaultProfile } from '../shared/schema.js';
import { attribution, buildPrompt, canBuild, personas, promptKinds, type PromptRunOutcome } from '../shared/prompt-kit.js';

const exercise = getExercise('electronics:quality')!;
const failing: PromptRunOutcome = { logs: [], preview: '{"observed":4,"accepted":0,"rate":0}', tests: [
  { name: '누락값을 분모에서 제외', passed: false, expected: '{"observed":4,"accepted":3,"rate":0.75}', actual: '{"observed":4,"accepted":0,"rate":0}', hint: '분모를 다시 보세요.' },
  { name: '빈 데이터', passed: true, expected: 'null', actual: 'null', hint: '' },
] };
const passing: PromptRunOutcome = { logs: [], tests: exercise.tests.map(t => ({ name: t.name, passed: true, expected: 'x', actual: 'x', hint: t.hint })) };

describe('prompt kit', () => {
  it('carries the failing test into the prompt, which is the whole reason to generate one', () => {
    const built = buildPrompt('debug', { exercise, code: 'function solve(rows){return null;}', result: failing });
    expect(built.text).toContain('누락값을 분모에서 제외');
    expect(built.text).toContain('{"observed":4,"accepted":3,"rate":0.75}');
    expect(built.text).toContain('function solve(rows){return null;}');
    expect(built.text).toContain('1 / 2 테스트 통과');
    // A passing test is noise in a debugging question - only the failures are listed by name.
    expect(built.text).not.toContain('빈 데이터');
  });
  it('never leaks the exercise hints or an instruction to hand over the answer', () => {
    for (const kind of promptKinds.map(k => k.id)) {
      const built = buildPrompt(kind, { exercise, code: exercise.starter, result: failing });
      for (const hint of exercise.hints) expect(built.text).not.toContain(hint);
      expect(built.text).toMatch(/정답.*(먼저 주지|주지 말고)/);
    }
  });
  it('replaces the prompts.chat placeholder instead of copying it out literally', () => {
    expect(personas.debug.text).toContain('${describe_your_bug_here}');
    const built = buildPrompt('debug', { exercise, code: 'x', result: failing });
    expect(built.text).not.toContain('${');
    expect(built.text).toContain('Act as a senior debugging engineer');
  });
  it('gates the two run-dependent kinds on there actually being a run to describe', () => {
    expect(canBuild('explain', null)).toBe(true);
    expect(canBuild('debug', null)).toBe(false);
    expect(canBuild('fix', null)).toBe(false);
    expect(canBuild('debug', passing)).toBe(false);
    expect(canBuild('fix', passing)).toBe(true);
    expect(canBuild('debug', { logs: [], tests: [], error: '실행 제한 시간을 초과했습니다.' })).toBe(true);
  });
  it('describes the runtime the learner is actually in, per language', () => {
    expect(buildPrompt('explain', { exercise, code: 'x' }).text).toContain('브라우저 샌드박스');
    expect(buildPrompt('explain', { exercise: getExercise('electronics:quality:sql')!, code: 'x' }).text).toContain('readings(grp TEXT, value REAL)');
    const r = buildPrompt('explain', { exercise: getExercise('electronics:quality:r')!, code: 'x' });
    expect(r.text).toContain('webR');
    expect(r.text).toContain('```r');
  });
  it('adds the learner background only when a profile is given', () => {
    const without = buildPrompt('explain', { exercise, code: 'x' });
    expect(without.text).not.toContain('나의 배경');
    const withProfile = buildPrompt('explain', { exercise, code: 'x', profile: { ...defaultProfile, major: '전자공학', role: '품질관리 엔지니어', level: 'beginner' } });
    expect(withProfile.text).toContain('나의 배경');
    expect(withProfile.text).toContain('전기·전자');
    expect(withProfile.text).toContain('전문 용어를 쓸 때는');
  });
  it('bounds what it copies so a long run cannot produce an unusable prompt', () => {
    const many: PromptRunOutcome = { logs: [], tests: Array.from({ length: 6 }, (_, i) => ({ name: `실패 ${i}`, passed: false, expected: 'a', actual: 'b', hint: '' })) };
    const built = buildPrompt('debug', { exercise, code: 'x'.repeat(9000), result: many });
    expect(built.text).toContain('실패 2');
    expect(built.text).not.toContain('실패 3');
    expect(built.notes).toEqual(['코드가 길어 앞부분 6,000자만 담았습니다.', '실패한 테스트 6개 중 앞 3개만 담았습니다.']);
    expect(built.text.length).toBeLessThan(12000);
  });
  it('keeps the CC0 attribution with every persona it ships', () => {
    for (const kind of promptKinds.map(k => k.id)) {
      expect(attribution(personas[kind])).toContain('prompts.chat');
      expect(attribution(personas[kind])).toContain('CC0-1.0');
    }
  });
});