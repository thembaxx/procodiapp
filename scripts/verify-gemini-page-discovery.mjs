import { searchGeminiPromotions } from '../src/lib/server/gemini-search.ts';
const result = await searchGeminiPromotions(AbortSignal.timeout(75_000));
console.log(JSON.stringify({webSearch:result.searched,readableSources:result.documents?.length??0,selectedLinks:result.rows.length,stores:[...new Set(result.rows.map(row=>row.storeId))],fallbackWarning:!!result.warning}));
if(result.warning || !result.documents?.length) process.exitCode=1;
