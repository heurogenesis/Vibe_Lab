import type { Pool } from 'pg';
import { disciplines, listExercises, projectDiscipline } from '../shared/catalog.js';
import { BANK_VERSION, questionTemplates, templateSchema, renderQuestion, scenario, type QuestionTemplate } from './question-bank.js';

export async function readQuestionBank(pool?: Pool): Promise<QuestionTemplate[]> {
  if (!pool) return structuredClone(questionTemplates);
  const result = await pool.query('SELECT payload FROM learning_question_templates WHERE version = $1 ORDER BY ordinal', [BANK_VERSION]);
  const bank = result.rows.map(row => templateSchema.parse(row.payload));
  if (bank.length < questionTemplates.length) throw new Error('학습 문제 은행 초기화가 필요합니다. server/seed-learning-content.ts를 실행하세요.');
  return bank;
}

// Versioned, additive content only. No learner profile, answer or progress row is modified.
export async function seedLearningContent(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS learning_question_templates (
      id TEXT NOT NULL, version TEXT NOT NULL, ordinal INTEGER NOT NULL, payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(id, version));
      CREATE TABLE IF NOT EXISTS learning_example_bank (
      exercise_id TEXT NOT NULL, version TEXT NOT NULL, payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(exercise_id, version));`);
    for (const [ordinal, template] of questionTemplates.entries()) {
      await client.query('INSERT INTO learning_question_templates (id,version,ordinal,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (id,version) DO NOTHING', [template.id,BANK_VERSION,ordinal,JSON.stringify(templateSchema.parse(template))]);
    }
    let exampleCount = 0;
    for (const exercise of listExercises()) {
      const d = [...disciplines,projectDiscipline].find(d => d.id === exercise.disciplineId)!;
      const templates = questionTemplates.filter(t => t.theme === exercise.theme);
      const questions = templates.map((t,i) => renderQuestion(t,d,scenario(d,i),i,exercise.id));
      // Store finite, JSON-safe worked examples. Runtime edge tests with NaN/Infinity remain in the code catalog.
      const payload = { exerciseId:exercise.id,catalogVersion:exercise.version,title:exercise.title,theme:exercise.theme,
        language:exercise.language,objective:exercise.objective,contract:exercise.contract,starter:exercise.starter,
        theory:exercise.theory,questions,origin:'vibe-lab-authored-synthetic',parameterSchemaVersion:BANK_VERSION };
      await client.query('INSERT INTO learning_example_bank (exercise_id,version,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT (exercise_id,version) DO NOTHING', [exercise.id,BANK_VERSION,JSON.stringify(payload)]);
      exampleCount++;
    }
    await client.query('COMMIT');
    return {templates:questionTemplates.length,examples:exampleCount,version:BANK_VERSION};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
