import { describe, expect, it } from 'vitest';
import { disciplines, projectDiscipline, getExercise, listExercises } from '../shared/catalog.js';
import { defaultProfile, curriculumSchema, type Assignment } from '../shared/schema.js';
import { generateRules, createAssignment } from '../server/curriculum.js';
import { parametersSchema, questionTemplates, renderQuestion, scenario, type QuestionTemplate } from '../server/question-bank.js';
const d = disciplines[0];
const profile = {...defaultProfile,domain:'data' as const,major:'전자공학',role:'연구개발',languageId:'typescript'};
const template = (kind: QuestionTemplate['kind']) => questionTemplates.find(t=>t.kind===kind)!;
const input = {lower:0,upper:10,values:[2,null,4,20],groups:['A','A','B','B'],outcomes:['success','empty','failed','failed']};
const correct = (kind:QuestionTemplate['kind'], data:unknown=input) => {const q=renderQuestion(template(kind),d,data,3);return q.options[q.answer];};
describe('parameterized question bank',()=>{
 it('computes answers from supplied parameters, not prewritten answer indices',()=>{
  expect(correct('mean')).toBe('3');expect(correct('valid-count')).toBe('2');
  expect(correct('weighted')).toBe('8.6667');expect(correct('group-mean')).toBe('2');
  expect(correct('rate')).toBe('0.6667');expect(correct('rejected')).toBe('1');
  expect(correct('median')).toBe('4');expect(correct('moving')).toBe('12');
  expect(correct('window-count')).toBe('2');expect(correct('normalized')).toBe('0.2');
  expect(correct('span')).toBe('10');expect(correct('requests')).toBe('2');expect(correct('failures')).toBe('2');
 });
 it('handles empty observations, inclusive bounds, signed values and invalid API parameters',()=>{
  const missing={...input,values:[null,null],groups:['A','B']};
  for(const kind of ['mean','median','moving','normalized','rate'] as const)expect(correct(kind,missing)).toBe('null (관측 없음)');
  const signed={...input,lower:-10,upper:10,values:[-10,10,0],groups:['A','A','B']};
  expect(correct('rate',signed)).toBe('1');expect(correct('normalized',signed)).toBe('0');
  expect(correct('median',{...input,values:[10,2,3,100],groups:['A','A','B','B']})).toBe('6.5');
  for(const invalid of [{...input,lower:10},{...input,values:[Infinity]}, {...input,values:[1]}, {...input,code:'eval()'}])expect(parametersSchema.safeParse(invalid).success).toBe(false);
 });
 it('validates all stored templates across every discipline with four unique choices',()=>{
  for(const field of [...disciplines,projectDiscipline])for(const t of questionTemplates)for(let seed=0;seed<8;seed++){
   const q=renderQuestion(t,field,scenario(field,seed),seed);
   expect(new Set(q.options).size).toBe(4);expect(q.question.length).toBeLessThanOrEqual(500);
   expect(q.answer).toBeGreaterThanOrEqual(0);expect(q.answer).toBeLessThan(4);
   expect(q.question).not.toContain('{{');expect(q.explanation.length).toBeLessThanOrEqual(800);
  }
 });
 it('rotates exercises and questions while preserving saved assignment snapshots',()=>{
  const previous:Assignment[]=[];
  for(let i=0;i<4;i++){
   const c=generateRules(profile,previous);expect(curriculumSchema.safeParse(c).success).toBe(true);
   const a=createAssignment(c,profile,'rules');
   a.practice!.exerciseIds.forEach((id,j)=>expect(getExercise(id)!.title).toBe(a.lessons[j].title));
   if(i)expect(a.quiz).not.toEqual(previous[0].quiz);
   previous.unshift(a);
  }
  expect(previous.map(a=>a.practice!.exerciseIds[0])).toEqual(['electronics:normalize','electronics:trend','electronics:median','electronics:compare']);
  const snapshot=JSON.stringify(previous);generateRules(profile,previous);expect(JSON.stringify(previous)).toBe(snapshot);
 });
 it('keeps SQL/R in supported themes and preserves PM project context',()=>{
  for(const languageId of ['sql','r']){
   const p={...profile,languageId,role:'연구개발 및 PM'};
   const first=createAssignment(generateRules(p,[]),p,'rules');
   const second=createAssignment(generateRules(p,[first]),p,'rules');
   for(const id of second.practice!.exerciseIds)expect(getExercise(id)!.language).toBe(languageId);
   expect(second.practice!.exerciseIds).toContain(`project:compare:${languageId}`);
   expect(second.quiz).not.toEqual(first.quiz);
  }
  expect(listExercises()).toHaveLength(234);
 });
});
