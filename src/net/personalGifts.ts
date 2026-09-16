import { ensureArenaAuth } from "./arenaAuth.js";
import type { GiftDefinition } from "../game/gift.js";

type PersonalGiftRow={id:string;gift_key:string;title:string;description:string;crystal:number;created_at:string;expires_at:string|null;claimed_at:string|null};
function env(n:string){try{return String((import.meta as any).env?.[n]??"").trim()}catch{return""}}
function cfg(){const url=env("VITE_SUPABASE_URL").replace(/\/+$/,""),key=env("VITE_SUPABASE_ANON_KEY");return url&&key?{url,key}:null}
async function request(path:string,init:RequestInit={}){const c=cfg(),s=await ensureArenaAuth();if(!c||!s)return null;try{const r=await fetch(c.url+"/rest/v1/"+path,{...init,headers:{apikey:c.key,Authorization:"Bearer "+s.accessToken,"Content-Type":"application/json",...(init.headers||{})}});return r.ok?r:null}catch{return null}}
export async function fetchPersonalGifts():Promise<GiftDefinition[]>{const r=await request("personal_gifts?select=id,gift_key,title,description,crystal,created_at,expires_at,claimed_at&claimed_at=is.null&order=created_at.desc");if(!r)return[];const rows=await r.json() as PersonalGiftRow[];return rows.filter(x=>x.crystal>0).map(x=>({giftId:"personal:"+x.id,title:x.title,description:x.description,rewards:[{kind:"CRYSTAL" as const,amount:x.crystal}],startsAt:x.created_at,expiresAt:x.expires_at}))}
export async function markPersonalGiftClaimed(giftId:string):Promise<boolean>{if(!giftId.startsWith("personal:"))return true;const id=giftId.slice(9);const r=await request("personal_gifts?id=eq."+encodeURIComponent(id)+"&claimed_at=is.null",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({claimed_at:new Date().toISOString()})});return !!r}
