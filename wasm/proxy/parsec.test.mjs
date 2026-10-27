import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createParsecLauncher } from "./parsec.mjs";
import "../www/controller-routing.js";
const host = {index:0,id:"Sony DualSense",mapping:"standard"}, guest = {index:1,id:"Xbox 360 Controller",mapping:"standard"};
test("explicit Parsec controller choice overrides the local PlayStation controller", () => {
	assert.equal(ChiakiControllerRouting.pick([host,guest],{index:1,id:guest.id},0),guest);
	assert.equal(ChiakiControllerRouting.pick([host],{index:1,id:guest.id},0),null);
	assert.equal(ChiakiControllerRouting.pick([{...host,index:1}],{index:1,id:guest.id},1),null);
	assert.equal(ChiakiControllerRouting.pick([host,guest],null,0),host);
	assert.equal(ChiakiControllerRouting.pick([host,guest],null,1),guest);
	assert.equal(ChiakiControllerRouting.pick([guest,host],null,-1),host);
});
test("Parsec launcher starts only the fixed executable with no shell or arguments", async () => {
	let call;
	const launcher = createParsecLauncher({platform:"win32",env:{ProgramFiles:"C:\\Program Files"},stat:async()=>({isFile:()=>true}),spawnImpl:(...args)=>{
		call=args;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit("spawn"));return child;
	}});
	assert.deepEqual(await launcher.status(),{supported:true,installed:true});
	assert.deepEqual(await launcher.open(),{opened:true});
	assert.equal(call[0],"C:\\Program Files\\Parsec\\parsecd.exe");assert.deepEqual(call[1],[]);assert.equal(call[2].shell,false);
});
test("missing, unsupported or failed Parsec launches report errors without fallback commands", async () => {
	const missing=createParsecLauncher({platform:"win32",env:{ProgramFiles:"relative-path"},stat:()=>{throw Error("Must not probe relative paths");}});
	assert.deepEqual(await missing.status(),{supported:true,installed:false});await assert.rejects(missing.open(),/not found/);
	await assert.rejects(createParsecLauncher({platform:"linux"}).open(),/app launcher/);
	const failed=createParsecLauncher({platform:"win32",env:{ProgramFiles:"C:\\Program Files"},stat:async()=>({isFile:()=>true}),spawnImpl:()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit("error",Error("bad")));return child;}});
	await assert.rejects(failed.open(),/could not open/);
});
