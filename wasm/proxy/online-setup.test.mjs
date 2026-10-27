import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import "../www/online-protocol.js";
const key = "a".repeat(64);
const code = (data) => "chiaki-host-v1:" + Buffer.from(JSON.stringify(data)).toString("base64url");
test("private server setup codes validate every credential and reject embedded URL data", () => {
	assert.deepEqual(ChiakiOnlineProtocol.setup(code({server:"https://play.example.com",key})), {server:"https://play.example.com",key});
	for (const value of ["bad", "chiaki-host-v1:bad", code({server:"https://play.example.com/path",key}),code({server:"https://user:secret@example.com",key}),code({server:"http://example.com",key}),code({server:"https://example.com",key:"bad"}),code(null),"x".repeat(2049)]) assert.throws(() => ChiakiOnlineProtocol.setup(value));
});
function host(streaming = true) {
	const elements = new Map(), sockets = [], timeouts = new Map(); let nextTimer = 1;
	function el() { return {value:"", textContent:"", disabled:false, hidden:false,classList:{add(){},remove(){},toggle(){}}, getTracks(){return []},append(){},select(){}}; }
	const get = (id) => { if (!elements.has(id)) elements.set(id,el()); return elements.get(id); };
	get("online-minutes").value="30"; get("online-quality").value="720";
	class Socket { constructor(url) { this.url=url; this.readyState=1; this.bufferedAmount=0; this.sent=[]; sockets.push(this); } send(msg){this.sent.push(JSON.parse(msg));} close(){this.closed=true;} }
	const context = {ChiakiOnlineProtocol,URL,WebSocket:Socket,streaming,performance:{now:()=>10},Date,
		document:{getElementById:get,createElement:()=>({width:0,height:0,getContext:()=>({}),captureStream:()=>({getVideoTracks:()=>[{requestFrame(){}}],getTracks:()=>[]})})},
		audio:{},window:{addEventListener(){}},setInterval(){},setTimeout(fn){const id=nextTimer++;timeouts.set(id,fn);return id;},clearTimeout(id){timeouts.delete(id);},
		localStorage:{setItem(){throw new Error("Host credentials must not be persisted");}},openSettingsTab(){} };
	vm.createContext(context);vm.runInContext(fs.readFileSync(new URL("../www/online-host.js",import.meta.url),"utf8"),context);
	return {get,sockets,context,timeouts};
}
test("setup stays in tab memory, supports repeated invites and requires a running console", () => {
	const h=host(false);h.get("online-setup-code").value=code({server:"https://play.example.com",key});h.get("online-setup-use").onclick();
	assert.equal(h.get("online-setup-code").value,"");assert.equal(h.get("online-key").value,"");assert.equal(h.get("online-configured").hidden,false);assert.equal(h.get("online-start").disabled,true);assert.equal(h.sockets.length,0);
	h.context.streaming=true;h.context.ChiakiOnline.streamState(true);assert.equal(h.get("online-start").disabled,false);
	h.get("online-start").onclick();const first=h.sockets[0];first.onopen();assert.equal(first.sent[0].hostKey,key);
	first.onmessage({data:JSON.stringify({type:"created",iceServers:[],expires:Date.now()+30000,token:"example"})});assert.equal(h.get("online-invite-ready").hidden,false);
	h.get("online-stop").onclick();assert.equal(first.closed,true);assert.equal(h.get("online-invite").value,"");assert.equal(first.sent.at(-1).type,"revoke");
	h.get("online-start").onclick();const second=h.sockets[1];second.onopen();assert.equal(second.sent[0].hostKey,key);
	h.context.streaming=false;h.context.ChiakiOnline.streamState(false);assert.equal(second.closed,true);assert.equal(h.get("online-start").disabled,true);
	h.get("online-change").onclick();assert.equal(h.get("online-setup").hidden,false);
});
test("invalid setup never connects and a hung invitation attempt times out", () => {
	const h=host();h.get("online-setup-code").value="not a setup code";h.get("online-setup-use").onclick();assert.equal(h.sockets.length,0);assert.equal(h.get("online-start").disabled,true);
	h.get("online-server").value="https://play.example.com";h.get("online-key").value=key;h.get("online-manual-use").onclick();h.get("online-start").onclick();
	[...h.timeouts.values()][0]();assert.equal(h.sockets[0].closed,true);assert.match(h.get("online-status").textContent,/did not respond/);assert.equal(h.get("online-start").disabled,false);
});
