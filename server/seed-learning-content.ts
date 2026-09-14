import 'dotenv/config';
import pg from 'pg';
import { seedLearningContent } from './learning-content-store.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL이 필요합니다. 파일 저장 모드에는 PostgreSQL 문제 은행을 생성하지 않습니다.');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:1,
  ...(process.env.DATABASE_CA_CERT ? {ssl:{ca:process.env.DATABASE_CA_CERT,rejectUnauthorized:true}} : {})});
try { console.log(JSON.stringify(await seedLearningContent(pool))); }
catch { console.error('학습 콘텐츠 저장 실패. DB 연결·인증서·테이블 생성 권한을 확인하세요. 기존 학습 기록은 변경하지 않습니다.'); process.exitCode=1; }
finally { await pool.end(); }
