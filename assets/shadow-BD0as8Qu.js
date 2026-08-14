import{i as z,h as X,r as p,s as y,d as c,v as F,V as Y,O as V,t as U,u as b,C as q}from"./index-DR2yh6M6.js";import{C as m}from"./CanvasTextGenerator-dLllHPPT.js";import{G}from"./Graphics-Dsq1kP1t.js";import{F as v}from"./Filter-D7y0njXx.js";const w={5:[.153388,.221461,.250301],7:[.071303,.131514,.189879,.214607],9:[.028532,.067234,.124009,.179044,.20236],11:[.0093,.028002,.065984,.121703,.175713,.198596],13:[.002406,.009255,.027867,.065666,.121117,.174868,.197641],15:[489e-6,.002403,.009246,.02784,.065602,.120999,.174697,.197448]},M=["in vec2 vBlurTexCoords[%size%];","uniform sampler2D uTexture;","out vec4 finalColor;","void main(void)","{","    finalColor = vec4(0.0);","    %blur%","}"].join(`
`);function I(u){const t=w[u],e=t.length;let r=M,i="";const s="finalColor += texture(uTexture, vBlurTexCoords[%index%]) * %value%;";let n;for(let l=0;l<u;l++){let a=s.replace("%index%",l.toString());n=l,l>=e&&(n=u-l-1),a=a.replace("%value%",t[n].toString()),i+=a,i+=`
`}return r=r.replace("%blur%",i),r=r.replace("%size%",u.toString()),r}const $=`
    in vec2 aPosition;

    uniform float uStrength;

    out vec2 vBlurTexCoords[%size%];

    uniform vec4 uInputSize;
    uniform vec4 uOutputFrame;
    uniform vec4 uOutputTexture;

    vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

    vec2 filterTextureCoord( void )
    {
        return aPosition * (uOutputFrame.zw * uInputSize.zw);
    }

    void main(void)
    {
        gl_Position = filterVertexPosition();

        float pixelStrength = uInputSize.%dimension% * uStrength;

        vec2 textureCoord = filterTextureCoord();
        %blur%
    }`;function E(u,t){const e=Math.ceil(u/2);let r=$,i="",s;t?s="vBlurTexCoords[%index%] =  textureCoord + vec2(%sampleIndex% * pixelStrength, 0.0);":s="vBlurTexCoords[%index%] =  textureCoord + vec2(0.0, %sampleIndex% * pixelStrength);";for(let n=0;n<u;n++){let l=s.replace("%index%",n.toString());l=l.replace("%sampleIndex%",`${n-(e-1)}.0`),i+=l,i+=`
`}return r=r.replace("%blur%",i),r=r.replace("%size%",u.toString()),r=r.replace("%dimension%",t?"z":"w"),r}function W(u,t){const e=E(t,u),r=I(t);return z.from({vertex:e,fragment:r,name:`blur-${u?"horizontal":"vertical"}-pass-filter`})}var A=`

struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct BlurUniforms {
  uStrength:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@group(1) @binding(0) var<uniform> blurUniforms : BlurUniforms;


struct VSOutput {
    @builtin(position) position: vec4<f32>,
    %blur-struct%
  };

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

fn globalTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
  return  (aPosition.xy / gfu.uGlobalFrame.zw) + (gfu.uGlobalFrame.xy / gfu.uGlobalFrame.zw);  
}

fn getSize() -> vec2<f32>
{
  return gfu.uGlobalFrame.zw;
}


@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>, 
) -> VSOutput {

  let filteredCord = filterTextureCoord(aPosition);

  let pixelStrength = gfu.uInputSize.%dimension% * blurUniforms.uStrength;

  return VSOutput(
   filterVertexPosition(aPosition),
    %blur-vertex-out%
  );
}

@fragment
fn mainFragment(
  @builtin(position) position: vec4<f32>,
  %blur-fragment-in%
) -> @location(0) vec4<f32> {

    var   finalColor = vec4(0.0);

    %blur-sampling%

    return finalColor;
}`;function j(u,t){const e=w[t],r=e.length,i=[],s=[],n=[];for(let o=0;o<t;o++){i[o]=`@location(${o}) offset${o}: vec2<f32>,`,u?s[o]=`filteredCord + vec2(${o-r+1} * pixelStrength, 0.0),`:s[o]=`filteredCord + vec2(0.0, ${o-r+1} * pixelStrength),`;const f=o<r?o:t-o-1,g=e[f].toString();n[o]=`finalColor += textureSample(uTexture, uSampler, offset${o}) * ${g};`}const l=i.join(`
`),a=s.join(`
`),h=n.join(`
`),d=A.replace("%blur-struct%",l).replace("%blur-vertex-out%",a).replace("%blur-fragment-in%",l).replace("%blur-sampling%",h).replace("%dimension%",u?"z":"w");return X.from({vertex:{source:d,entryPoint:"mainVertex"},fragment:{source:d,entryPoint:"mainFragment"}})}const S=class _ extends v{constructor(t){t={..._.defaultOptions,...t};const e=W(t.horizontal,t.kernelSize),r=j(t.horizontal,t.kernelSize);super({glProgram:e,gpuProgram:r,resources:{blurUniforms:{uStrength:{value:0,type:"f32"}}},...t}),this.horizontal=t.horizontal,this._quality=0,this.quality=t.quality,this.blur=t.strength,this._uniforms=this.resources.blurUniforms.uniforms}apply(t,e,r,i){if(this._uniforms.uStrength=this.strength/this.passes,this.passes===1)t.applyFilter(this,e,r,i);else{const s=p.getSameSizeTexture(e);let n=e,l=s;this._state.blend=!1;const a=t.renderer.type===y.WEBGPU;for(let h=0;h<this.passes-1;h++){t.applyFilter(this,n,l,h===0?!0:a);const d=l;l=n,n=d}this._state.blend=!0,t.applyFilter(this,n,r,i),p.returnTexture(s)}}get blur(){return this.strength}set blur(t){this.padding=1+Math.abs(t)*2,this.strength=t}get quality(){return this._quality}set quality(t){this._quality=t,this.passes=t}};S.defaultOptions={strength:8,quality:4,kernelSize:5};let x=S;class P extends v{constructor(...t){let e=t[0]??{};typeof e=="number"&&(c(F,"BlurFilter constructor params are now options object. See params: { strength, quality, resolution, kernelSize }"),e={strength:e},t[1]!==void 0&&(e.quality=t[1]),t[2]!==void 0&&(e.resolution=t[2]||"inherit"),t[3]!==void 0&&(e.kernelSize=t[3])),e={...x.defaultOptions,...e};const{strength:r,strengthX:i,strengthY:s,quality:n,...l}=e;super({...l,compatibleRenderers:y.BOTH,resources:{}}),this._repeatEdgePixels=!1,this.blurXFilter=new x({horizontal:!0,...e}),this.blurYFilter=new x({horizontal:!1,...e}),this.quality=n,this.strengthX=i??r,this.strengthY=s??r,this.repeatEdgePixels=!1}apply(t,e,r,i){const s=Math.abs(this.blurXFilter.strength),n=Math.abs(this.blurYFilter.strength);if(s&&n){const l=p.getSameSizeTexture(e);this.blurXFilter.blendMode="normal",this.blurXFilter.apply(t,e,l,!0),this.blurYFilter.blendMode=this.blendMode,this.blurYFilter.apply(t,l,r,i),p.returnTexture(l)}else n?(this.blurYFilter.blendMode=this.blendMode,this.blurYFilter.apply(t,e,r,i)):(this.blurXFilter.blendMode=this.blendMode,this.blurXFilter.apply(t,e,r,i))}updatePadding(){this._repeatEdgePixels?this.padding=0:this.padding=Math.max(Math.abs(this.blurXFilter.blur),Math.abs(this.blurYFilter.blur))*2}get strength(){if(this.strengthX!==this.strengthY)throw new Error("BlurFilter's strengthX and strengthY are different");return this.strengthX}set strength(t){this.blurXFilter.blur=this.blurYFilter.blur=t,this.updatePadding()}get quality(){return this.blurXFilter.quality}set quality(t){this.blurXFilter.quality=this.blurYFilter.quality=t}get strengthX(){return this.blurXFilter.blur}set strengthX(t){this.blurXFilter.blur=t,this.updatePadding()}get strengthY(){return this.blurYFilter.blur}set strengthY(t){this.blurYFilter.blur=t,this.updatePadding()}get blur(){return c("8.3.0","BlurFilter.blur is deprecated, please use BlurFilter.strength instead."),this.strength}set blur(t){c("8.3.0","BlurFilter.blur is deprecated, please use BlurFilter.strength instead."),this.strength=t}get blurX(){return c("8.3.0","BlurFilter.blurX is deprecated, please use BlurFilter.strengthX instead."),this.strengthX}set blurX(t){c("8.3.0","BlurFilter.blurX is deprecated, please use BlurFilter.strengthX instead."),this.strengthX=t}get blurY(){return c("8.3.0","BlurFilter.blurY is deprecated, please use BlurFilter.strengthY instead."),this.strengthY}set blurY(t){c("8.3.0","BlurFilter.blurY is deprecated, please use BlurFilter.strengthY instead."),this.strengthY=t}get repeatEdgePixels(){return this._repeatEdgePixels}set repeatEdgePixels(t){this._repeatEdgePixels=t,this.updatePadding()}}P.defaultOptions={strength:8,quality:4,kernelSize:5};class L extends Y{constructor(t,e){const{text:r,resolution:i,style:s,anchor:n,width:l,height:a,roundPixels:h,...d}=t;super({...d}),this.batched=!0,this._resolution=null,this._autoResolution=!0,this._didTextUpdate=!0,this._styleClass=e,this.text=r??"",this.style=s,this.resolution=i??null,this.allowChildren=!1,this._anchor=new V({_onUpdate:()=>{this.onViewUpdate()}}),n&&(this.anchor=n),this.roundPixels=h??!1,l!==void 0&&(this.width=l),a!==void 0&&(this.height=a)}get anchor(){return this._anchor}set anchor(t){typeof t=="number"?this._anchor.set(t):this._anchor.copyFrom(t)}set text(t){t=t.toString(),this._text!==t&&(this._text=t,this.onViewUpdate())}get text(){return this._text}set resolution(t){this._autoResolution=t===null,this._resolution=t,this.onViewUpdate()}get resolution(){return this._resolution}get style(){return this._style}set style(t){t||(t={}),this._style?.off("update",this.onViewUpdate,this),t instanceof this._styleClass?this._style=t:this._style=new this._styleClass(t),this._style.on("update",this.onViewUpdate,this),this.onViewUpdate()}get width(){return Math.abs(this.scale.x)*this.bounds.width}set width(t){this._setWidth(t,this.bounds.width)}get height(){return Math.abs(this.scale.y)*this.bounds.height}set height(t){this._setHeight(t,this.bounds.height)}getSize(t){return t||(t={}),t.width=Math.abs(this.scale.x)*this.bounds.width,t.height=Math.abs(this.scale.y)*this.bounds.height,t}setSize(t,e){typeof t=="object"?(e=t.height??t.width,t=t.width):e??(e=t),t!==void 0&&this._setWidth(t,this.bounds.width),e!==void 0&&this._setHeight(e,this.bounds.height)}containsPoint(t){const e=this.bounds.width,r=this.bounds.height,i=-e*this.anchor.x;let s=0;return t.x>=i&&t.x<=i+e&&(s=-r*this.anchor.y,t.y>=s&&t.y<=s+r)}onViewUpdate(){this.didViewUpdate||(this._didTextUpdate=!0),super.onViewUpdate()}destroy(t=!1){super.destroy(t),this.owner=null,this._bounds=null,this._anchor=null,(typeof t=="boolean"?t:t?.style)&&this._style.destroy(t),this._style=null,this._text=null}get styleKey(){return`${this._text}:${this._style.styleKey}:${this._resolution}`}}function R(u,t){let e=u[0]??{};return(typeof e=="string"||u[1])&&(c(F,`use new ${t}({ text: "hi!", style }) instead`),e={text:e,style:u[1]}),e}class N extends L{constructor(...t){const e=R(t,"Text");super(e,U),this.renderPipeId="text",e.textureStyle&&(this.textureStyle=e.textureStyle instanceof b?e.textureStyle:new b(e.textureStyle))}updateBounds(){const t=this._bounds,e=this._anchor;let r=0,i=0;if(this._style.trim){const{frame:s,canvasAndContext:n}=m.getCanvasAndContext({text:this.text,style:this._style,resolution:1});m.returnCanvasAndContext(n),r=s.width,i=s.height}else{const s=q.measureText(this._text,this._style);r=s.width,i=s.height}t.minX=-e._x*r,t.maxX=t.minX+r,t.minY=-e._y*i,t.maxY=t.minY+i}}class J{shadow;playerWidth;maxBlur;minOpacity;maxOpacity=.7;blurFilter;constructor(t){this.playerWidth=t.playerWidth,this.maxBlur=t.maxBlur??15,this.minOpacity=t.minOpacity??.2,this.shadow=new G,this.shadow.alpha=this.maxOpacity,this.blurFilter=new P,this.blurFilter.strength=0,this.shadow.filters=[this.blurFilter]}update(t,e,r,i=1,s=.2){const n=this.playerWidth*Math.max(1,i),l=n/2,a=e+l,h=r-a,d=r*.5,o=Math.min(Math.max(h/d,0),1),f=this.maxOpacity-o*(this.maxOpacity-this.minOpacity),g=o*this.maxBlur,T=1-o*.5,O=n*T,B=8;this.shadow.clear(),this.shadow.ellipse(0,0,O/2,B/2),this.shadow.fill({color:0,alpha:f}),this.blurFilter.strength=g;const C=Math.max(0,(n-this.playerWidth)*s);this.shadow.position.set(t,r+C)}getView(){return this.shadow}destroy(){this.shadow.destroy()}}export{P as B,J as S,N as T};
