import { practiceMaterial, renderQuestion, scenario, questionTemplates, type QuestionTemplate } from './question-bank.js';
import type { Assignment, Curriculum, Profile } from '../shared/schema.js';
import { getExercise, profileSignature, recommendation, disciplines, projectDiscipline } from '../shared/catalog.js';
import { goalIntents } from '../shared/taxonomy.js';
// The curriculum body is written from the normalized signature (discipline x role x theme) rather than from the
// learner's own sentences. Two learners with the same background therefore receive the same body, which is what
// makes it cacheable and shareable later; their personal goal text is applied by the screen, not baked in here.
// See docs/DATA_ARCHITECTURE.md.
export function generatePracticeCurriculum(profile: Profile, previous: Assignment[], bank?: QuestionTemplate[]): Curriculum {
  const plan = recommendation(profile);
  const material = practiceMaterial(profile, previous, bank);

  const { role, goalIntent, language, outputTarget, promptSkill, environments } = profileSignature(profile);
  const intent = goalIntents.find(g => g.id === goalIntent) || goalIntents[goalIntents.length - 1];
  const lessons = material.exerciseIds.map(id => getExercise(id)!);
  const examples = material.quiz.map((q, index) => {
    const d = [...disciplines, projectDiscipline].find(d => d.id === lessons[index].disciplineId)!;
    const template = (bank || questionTemplates).find(t => t.id === q.templateId)!;
    return renderQuestion(template, d, scenario(d, previous.length * 3 + index + 4), index);
  });
  const latest = previous.find(a => a.practice);
  const review = !!latest?.quizResult && latest.quizResult.score / latest.quizResult.total < 0.67;
  const ready = !!latest && latest.practice?.exerciseIds.every(id => latest.practiceAttempts?.some(a => a.exerciseId === id && a.status === 'passed')) && latest.quizResult?.score === latest.quizResult?.total && !!latest.quizResult;
  const difficulty = review ? 'beginner' : ready && profile.level === 'beginner' ? 'intermediate' : profile.level;
  const guidance = difficulty === 'beginner' ? '빈칸을 하나씩 채우고, 각 테스트가 확인하는 조건을 설명합니다.' : '빈칸을 완성한 후 함수를 직접 재구성하고, 경계 조건 테스트를 추가할 사례를 설명합니다.';
  return {
    ...{practice: {catalogVersion: lessons[0].version, exerciseIds: material.exerciseIds}},
    title: `${plan.discipline.label} · ${lessons[0].title}`,
    summary: `${role.label} 관점에서 ${role.subject}을 다룹니다. ${lessons.map(l => l.title).join(' → ')}. ${intent.framing}`,
    // Never claim the practice runs in a language the sandbox cannot execute: a Python learner is told plainly
    // that the prompts come in Python while the graded run stays TypeScript. Built from parts so an empty
    // segment does not leave a double space in the sentence the learner reads.
    rationale: [
      plan.reason,
      promptSkill.coaching,
      language.executable ? `실행과 채점은 ${language.label}로 진행합니다.` : language.note,
      review ? '이전 이해도 결과를 바탕으로 기초 개념을 복습합니다.' : '',
      `작업 환경은 ${environments.map(e => e.label).join(', ')} 기준으로 안내합니다.`,
      guidance,
    ].filter(Boolean).join(' ').replace(/\s{2,}/g, ' '),
    difficulty, minutes: profile.minutes * lessons.length,
    concepts: [`${language.label} 함수`, '데이터 계약', '누락값과 경계 조건', '자동 테스트', '그룹별 집계', '비동기 처리'],
    lessons: lessons.map((exercise, index) => ({
      title: exercise.title,
      description: `${exercise.objective} ${role.subject}에서 이 계산이 틀리면 ${role.decision} 판단이 함께 흔들립니다.`,
      objective: `${exercise.objective} ${guidance}`,
      prompt: `${exercise.contract}\n정답을 먼저 제시하지 말고, ${plan.discipline.label} 분야의 ${role.label} 관점에서 필요한 개념과 작은 힌트만 ${language.label} 기준으로 설명해 줘.`,
      theory: `${exercise.theory}\n\n연습 예제: ${examples[index].question}\n풀이: ${examples[index].explanation}`,
      experiment: `합성 샘플로 실행하고 테스트의 기대값과 실제값을 비교하세요. 값을 일부러 누락시키거나 범위 밖으로 바꾸면 ${role.metric}이 어떻게 달라지는지 확인하세요. 코드나 데이터를 바꾼 뒤에는 다시 실행해야 합니다.${index === lessons.length - 1 ? ` 마지막으로, 만들고 싶은 결과물(${outputTarget.label})을 떠올리며 ${outputTarget.closing}` : ''}`,
      checks: ['브라우저에서 코드를 실행하고 테스트 결과를 확인했다', '실패한 조건과 수정한 이유를 설명할 수 있다', `이 계산이 ${role.metric}과 어떻게 연결되는지 설명할 수 있다`, '테스트 통과가 모든 업무 데이터에 대한 정확성을 보장하지 않음을 이해했다'],
    })),
    quiz: material.quiz,
  };
}
