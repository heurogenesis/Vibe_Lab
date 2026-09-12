// No learner code is interpolated here. The parent supplies code to a disposable
// Worker. The opaque iframe origin prevents access to the application's state.
export const sandboxCsp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts";
export const sandboxHtml = `<!doctype html><meta charset="utf-8"><title>Practice sandbox</title><script>
const runId=location.hash.slice(1);
let started=false;
addEventListener('message',event=>{
 if(event.source!==parent || event.data?.runId!==runId || event.data.type!=='run' || started) return;
 started=true;
 const url=URL.createObjectURL(new Blob([event.data.program],{type:'text/javascript'}));
 const worker=new Worker(url);
 let ended=false;
 const finish=result=>{if(ended)return;ended=true;worker.terminate();URL.revokeObjectURL(url);parent.postMessage({type:'result',runId,result},'*');};
 worker.onmessage=event=>finish(event.data);
 worker.onerror=()=>finish({tests:[],logs:[],error:'코드 실행 중 오류가 발생했습니다.'});
 worker.postMessage(event.data.payload);
});
parent.postMessage({type:'ready',runId},'*');
</script>`;
