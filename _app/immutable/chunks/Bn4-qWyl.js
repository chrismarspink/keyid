import{k as p,j as u,s as y,R as f,l,h as m}from"./CMzWqsYp.js";function E(){if(typeof window>"u")return;const e=new u({name:"webcrypto",crypto:window.crypto});y("webcrypto",e)}const w="2.5.4.3",A="2.5.4.10",d="2.5.4.6",I="1.2.840.113549.1.9.1";function o(e,n){const t=new f;return t.typesAndValues.push(new l({type:e,value:new m({value:n})})),t}async function C(e,n){E();const t=new p;t.version=0;const i=[];n.country&&i.push(o(d,n.country)),n.organization&&i.push(o(A,n.organization)),i.push(o(w,n.commonName)),n.email&&i.push(o(I,n.email)),t.subject.typesAndValues=i.flatMap(s=>s.typesAndValues),await t.subjectPublicKeyInfo.importKey(e.publicKey),await t.sign(e.privateKey,"SHA-256");const a=t.toSchema().toBER(!1),r=btoa(Array.from(new Uint8Array(a),s=>String.fromCharCode(s)).join("")),c=`-----BEGIN CERTIFICATE REQUEST-----
${r.match(/.{1,64}/g)?.join(`
`)??r}
-----END CERTIFICATE REQUEST-----
`;return{csrDer:a,csrPem:c}}export{C as g};
