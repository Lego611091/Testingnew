const http=require('http'),crypto=require('crypto'),{WebSocketServer}=require('ws'),Db=require('better-sqlite3');
const db=new Db(process.env.DB_PATH||'nebula.db');
db.exec("create table if not exists users(u text primary key,name text,salt text,hash text,role text default 'member',xp integer default 0,token text,last integer default 0);create table if not exists msgs(id integer primary key autoincrement,ch text,u text,t text,url text,ts integer)");
const R=['member','friend','link maker','co owner','owner'],MIN={chat:0,links:2,ann:3},OWNER='lego61109';
const H=(p,s)=>crypto.scryptSync(p,s,32).toString('hex'),rk=r=>R.indexOf(r),get=u=>db.prepare('select * from users where u=?').get(u);
(()=>{const p=process.env.OWNER_PASSWORD;if(!p)return console.log('Set the OWNER_PASSWORD env var');const s=crypto.randomBytes(8).toString('hex');
 if(get(OWNER))db.prepare("update users set salt=?,hash=?,role='owner' where u=?").run(s,H(p,s),OWNER);
 else db.prepare("insert into users(u,name,salt,hash,role) values(?,?,?,?,'owner')").run(OWNER,'Lego61109',s,H(p,s))})();
const pub=r=>({n:r.name,role:r.role,xp:r.xp});
const rows=c=>db.prepare("select m.id,m.ch,m.t,m.url,m.ts,u.name n,u.role,u.xp from msgs m join users u on u.u=m.u where m.ch=? order by m.id desc limit ?").all(c,c=='ann'?2000:300).reverse();
const wss=new WebSocketServer({server:http.createServer((q,r)=>r.end('Nebula chat ok')).listen(process.env.PORT||8080)});
const send=(w,o)=>w.readyState==1&&w.send(JSON.stringify(o)),all=o=>wss.clients.forEach(w=>w.me&&send(w,o));
function auth(w,r){w.me=r.u;const t=r.token||crypto.randomBytes(24).toString('hex');db.prepare('update users set token=? where u=?').run(t,r.u);send(w,{type:'auth',token:t,me:pub(r)});for(const c in MIN)send(w,{type:'history',ch:c,msgs:rows(c)})}
wss.on('connection',w=>{w.on('message',d=>{let o;try{o=JSON.parse(d)}catch{return}
 const s=String(o.u||'').trim(),u=s.toLowerCase(),err=m=>send(w,{type:'err',m});
 if(o.type=='signup'){if(!/^[a-z0-9_]{3,16}$/i.test(s))return err('Username: 3-16 letters, numbers or _');if(String(o.p||'').length<6)return err('Password needs 6+ characters');if(u==OWNER||get(u))return err('Username taken');const sa=crypto.randomBytes(8).toString('hex');db.prepare('insert into users(u,name,salt,hash) values(?,?,?,?)').run(u,s,sa,H(o.p,sa));return auth(w,get(u))}
 if(o.type=='login'){const r=get(u);if(!r||!crypto.timingSafeEqual(Buffer.from(H(String(o.p||''),r.salt)),Buffer.from(r.hash)))return err('Wrong username or password');return auth(w,r)}
 if(o.type=='resume'){const r=o.k&&db.prepare('select * from users where token=?').get(String(o.k));return r?auth(w,r):send(w,{type:'err',m:'Session expired',bad:1})}
 const m=w.me&&get(w.me);if(!m)return;const ar=rk(m.role);
 if(o.type=='msg'){const c=o.ch,t=String(o.t||'').trim().slice(0,500),url=String(o.url||'').trim().slice(0,500),n=Date.now();
  if(!(c in MIN)||ar<MIN[c]||(!t&&!url)||n-(w.l||0)<800)return;if(c=='links'&&!/^https?:\/\//i.test(url))return err('Link must start with http(s)://');w.l=n;
  let xp=m.xp;if(c=='chat'&&n-m.last>8000){xp+=5;db.prepare('update users set xp=?,last=? where u=?').run(xp,n,m.u)}
  const id=db.prepare('insert into msgs(ch,u,t,url,ts) values(?,?,?,?,?)').run(c,m.u,t,c=='links'?url:'',n).lastInsertRowid;
  return all({type:'new',m:{id,ch:c,t,url:c=='links'?url:'',ts:n,n:m.name,role:m.role,xp}})}
 if(ar<3)return;
 if(o.type=='users')return send(w,{type:'users',users:db.prepare('select name n,role,xp from users order by xp desc').all()});
 if(o.type=='del'){db.prepare('delete from msgs where id=?').run(+o.id);return all({type:'del',id:+o.id})}
 if(o.type=='setrole'){const t=get(String(o.n||'').toLowerCase()),nr=rk(o.role);if(!t||nr<0||nr>(ar==4?3:2)||rk(t.role)>=ar)return;db.prepare('update users set role=? where u=?').run(R[nr],t.u);all({type:'role',n:t.name,role:R[nr]})}
 })});
console.log('Nebula chat server running');
