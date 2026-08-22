import fs from "node:fs";import path from "node:path";import {createClient} from "@supabase/supabase-js";
const ROOT="d:/đuanonhang/vinon-master";
for(const f of[".env",".env.local"]){const p=path.join(ROOT,f);if(!fs.existsSync(p))continue;
for(const line of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
// duplicate slugs
let all=[],from=0;for(;;){const{data}=await db.from("products").select("id,slug").order("id").range(from,from+999);all=all.concat(data||[]);if(!data||data.length<1000)break;from+=1000;}
const m=new Map();for(const r of all){const k=String(r.slug??"");m.set(k,(m.get(k)||0)+1);}
const dups=[...m.entries()].filter(([,n])=>n>1);
console.log("Slug trùng KHỚP TUYỆT ĐỐI:",dups.length, dups.slice(0,10));
// stock_on_hand sample
const{data:s,error:se}=await db.from("stock_on_hand").select("*").limit(2);
console.log("stock_on_hand cols:",se?se.message:Object.keys(s?.[0]||{}));
const{count:sc}=await db.from("stock_on_hand").select("product_id",{count:"exact",head:true});
console.log("stock_on_hand rows:",sc);
