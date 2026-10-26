globalThis.ChiakiVideo = Object.freeze({
	createStats() {
		let since = null, bytes = 0, decoded = 0, lost = 0;
		return {
			reset(now) { since = now; bytes = decoded = lost = 0; },
			receive(size, missing = 0, recovered = false) { bytes += size; if (!recovered) lost += Math.max(0, missing); },
			decoded() { decoded++; },
			sample(now) {
				if (since === null) { since = now; return null; }
				const seconds = (now - since) / 1000;
				if (seconds < 1) return null;
				const result = { mbps: bytes * 8 / seconds / 1e6, fps: decoded / seconds, lost };
				since = now; bytes = decoded = lost = 0; return result;
			}
		};
	},
	frameDest(frame) {
		// Canvas/WebGL already apply visibleRect; do not crop the displayed image twice.
		return { sx: 0, sy: 0,
			sw: frame.displayWidth || frame.visibleRect?.width || frame.codedWidth,
			sh: frame.displayHeight || frame.visibleRect?.height || frame.codedHeight };
	},
	create(canvas) {
		const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
		if (!gl) {
			const ctx = canvas.getContext("2d", { alpha: false });
			return { sharp: false, draw(frame) { ctx.imageSmoothingEnabled = false; ctx.drawImage(frame, 0, 0, canvas.width, canvas.height); } };
		}
		let program, texture, rect, pixel, amount, noise;
		function setup() {
			const shader = (type, source) => {
				const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
				if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
				return s;
			};
			const vertex = shader(gl.VERTEX_SHADER, `attribute vec2 position; varying vec2 uv; uniform vec4 rect;
				void main(){gl_Position=vec4(position,0.,1.);uv=rect.xy+vec2((position.x+1.)*.5,(1.-position.y)*.5)*rect.zw;}`);
			const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ? "highp" : "mediump";
			const fragment = shader(gl.FRAGMENT_SHADER, `precision ${precision} float; varying vec2 uv;
				uniform sampler2D video; uniform vec2 pixel; uniform float amount; uniform float noise;
				vec3 clean(vec2 at){
				 vec3 c=texture2D(video,at).rgb;
				 if(noise<.001)return c;
				 vec3 sum=c; float weights=1.; float threshold=mix(.006,.065,noise);
				 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
				  if(x==0&&y==0)continue;
				  vec3 n=texture2D(video,at+vec2(float(x),float(y))*pixel).rgb;
				  vec3 diff=n-c;float distance=max(abs(diff.r),max(abs(diff.g),abs(diff.b)));
				  float weight=exp(-distance*distance/(threshold*threshold))* .65;
				  sum+=n*weight;weights+=weight;
				 }
				 return mix(c,sum/weights,noise);
				}
				void main(){vec3 c=texture2D(video,uv).rgb;
				vec3 l=texture2D(video,uv-vec2(pixel.x,0.)).rgb,r=texture2D(video,uv+vec2(pixel.x,0.)).rgb;
				vec3 u=texture2D(video,uv-vec2(0.,pixel.y)).rgb,d=texture2D(video,uv+vec2(0.,pixel.y)).rgb;
				vec3 lo=min(c,min(min(l,r),min(u,d))),hi=max(c,max(max(l,r),max(u,d)));
				vec3 base=clean(uv);
				// Only sharpen stronger edges, rather than lifting fog grain again.
				vec3 contrast=hi-lo;
				float edge=smoothstep(.04,.15,max(contrast.r,max(contrast.g,contrast.b)));
				gl_FragColor=vec4(clamp(base+(c-(l+r+u+d)*.25)*amount*edge,lo,hi),1.);}`);
			program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
			gl.deleteShader(vertex); gl.deleteShader(fragment); gl.useProgram(program);
			const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
			const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
			texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
			for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
			for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.LINEAR);
			rect = gl.getUniformLocation(program, "rect"); pixel = gl.getUniformLocation(program, "pixel"); amount = gl.getUniformLocation(program, "amount"); noise = gl.getUniformLocation(program, "noise");
			gl.disable(gl.DITHER);
		}
		setup();
		canvas.addEventListener("webglcontextlost", (event) => event.preventDefault());
		canvas.addEventListener("webglcontextrestored", setup);
		return {
			sharp: true,
			draw(frame, d, strength = 0, denoise = 0) {
				if (gl.isContextLost()) return;
				// Uploads expose the VideoFrame's display image, with visibleRect already applied.
				const w = frame.displayWidth || frame.width, h = frame.displayHeight || frame.height;
				gl.viewport(0, 0, canvas.width, canvas.height);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
				gl.uniform4f(rect, 0, 0, 1, 1);
				gl.uniform2f(pixel, 1 / w, 1 / h);
				gl.uniform1f(amount, Math.max(0, Math.min(100, Number(strength) || 0)) / 100);
				gl.uniform1f(noise, Math.max(0, Math.min(100, Number(denoise) || 0)) / 100);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
		};
	}
});
