import{U as d,h as C,i as _,e as f}from"./index-DR2yh6M6.js";import{F as P}from"./Filter-D7y0njXx.js";import{v as U}from"./defaultFilter.vert-Dw338EcB.js";var y=`
in vec2 vTextureCoord;
in vec4 vColor;

out vec4 finalColor;

uniform float uColorMatrix[20];
uniform float uAlpha;

uniform sampler2D uTexture;

float rand(vec2 co)
{
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main()
{
    vec4 color = texture(uTexture, vTextureCoord);
    float randomValue = rand(gl_FragCoord.xy * 0.2);
    float diff = (randomValue - 0.5) *  0.5;

    if (uAlpha == 0.0) {
        finalColor = color;
        return;
    }

    if (color.a > 0.0) {
        color.rgb /= color.a;
    }

    vec4 result;

    result.r = (uColorMatrix[0] * color.r);
        result.r += (uColorMatrix[1] * color.g);
        result.r += (uColorMatrix[2] * color.b);
        result.r += (uColorMatrix[3] * color.a);
        result.r += uColorMatrix[4];

    result.g = (uColorMatrix[5] * color.r);
        result.g += (uColorMatrix[6] * color.g);
        result.g += (uColorMatrix[7] * color.b);
        result.g += (uColorMatrix[8] * color.a);
        result.g += uColorMatrix[9];

    result.b = (uColorMatrix[10] * color.r);
       result.b += (uColorMatrix[11] * color.g);
       result.b += (uColorMatrix[12] * color.b);
       result.b += (uColorMatrix[13] * color.a);
       result.b += uColorMatrix[14];

    result.a = (uColorMatrix[15] * color.r);
       result.a += (uColorMatrix[16] * color.g);
       result.a += (uColorMatrix[17] * color.b);
       result.a += (uColorMatrix[18] * color.a);
       result.a += uColorMatrix[19];

    vec3 rgb = mix(color.rgb, result.rgb, uAlpha);

    // Premultiply alpha again.
    rgb *= result.a;

    finalColor = vec4(rgb, result.a);
}
`,g=`struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct ColorMatrixUniforms {
  uColorMatrix:array<vec4<f32>, 5>,
  uAlpha:f32,
};


@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> colorMatrixUniforms : ColorMatrixUniforms;


struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
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

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>, 
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition),
  );
}


@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {


  var c = textureSample(uTexture, uSampler, uv);
  
  if (colorMatrixUniforms.uAlpha == 0.0) {
    return c;
  }

 
    // Un-premultiply alpha before applying the color matrix. See issue #3539.
    if (c.a > 0.0) {
      c.r /= c.a;
      c.g /= c.a;
      c.b /= c.a;
    }

    var cm = colorMatrixUniforms.uColorMatrix;


    var result = vec4<f32>(0.);

    result.r = (cm[0][0] * c.r);
    result.r += (cm[0][1] * c.g);
    result.r += (cm[0][2] * c.b);
    result.r += (cm[0][3] * c.a);
    result.r += cm[1][0];

    result.g = (cm[1][1] * c.r);
    result.g += (cm[1][2] * c.g);
    result.g += (cm[1][3] * c.b);
    result.g += (cm[2][0] * c.a);
    result.g += cm[2][1];

    result.b = (cm[2][2] * c.r);
    result.b += (cm[2][3] * c.g);
    result.b += (cm[3][0] * c.b);
    result.b += (cm[3][1] * c.a);
    result.b += cm[3][2];

    result.a = (cm[3][3] * c.r);
    result.a += (cm[4][0] * c.g);
    result.a += (cm[4][1] * c.b);
    result.a += (cm[4][2] * c.a);
    result.a += cm[4][3];

    var rgb = mix(c.rgb, result.rgb, colorMatrixUniforms.uAlpha);

    rgb.r *= result.a;
    rgb.g *= result.a;
    rgb.b *= result.a;

    return vec4(rgb, result.a);
}`;class V extends P{constructor(n={}){const r=new d({uColorMatrix:{value:[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],type:"f32",size:20},uAlpha:{value:1,type:"f32"}}),t=C.from({vertex:{source:g,entryPoint:"mainVertex"},fragment:{source:g,entryPoint:"mainFragment"}}),o=_.from({vertex:U,fragment:y,name:"color-matrix-filter"});super({...n,gpuProgram:t,glProgram:o,resources:{colorMatrixUniforms:r}}),this.alpha=1}_loadMatrix(n,r=!1){let t=n;r&&(this._multiply(t,this.matrix,n),t=this._colorMatrix(t)),this.resources.colorMatrixUniforms.uniforms.uColorMatrix=t,this.resources.colorMatrixUniforms.update()}_multiply(n,r,t){return n[0]=r[0]*t[0]+r[1]*t[5]+r[2]*t[10]+r[3]*t[15],n[1]=r[0]*t[1]+r[1]*t[6]+r[2]*t[11]+r[3]*t[16],n[2]=r[0]*t[2]+r[1]*t[7]+r[2]*t[12]+r[3]*t[17],n[3]=r[0]*t[3]+r[1]*t[8]+r[2]*t[13]+r[3]*t[18],n[4]=r[0]*t[4]+r[1]*t[9]+r[2]*t[14]+r[3]*t[19]+r[4],n[5]=r[5]*t[0]+r[6]*t[5]+r[7]*t[10]+r[8]*t[15],n[6]=r[5]*t[1]+r[6]*t[6]+r[7]*t[11]+r[8]*t[16],n[7]=r[5]*t[2]+r[6]*t[7]+r[7]*t[12]+r[8]*t[17],n[8]=r[5]*t[3]+r[6]*t[8]+r[7]*t[13]+r[8]*t[18],n[9]=r[5]*t[4]+r[6]*t[9]+r[7]*t[14]+r[8]*t[19]+r[9],n[10]=r[10]*t[0]+r[11]*t[5]+r[12]*t[10]+r[13]*t[15],n[11]=r[10]*t[1]+r[11]*t[6]+r[12]*t[11]+r[13]*t[16],n[12]=r[10]*t[2]+r[11]*t[7]+r[12]*t[12]+r[13]*t[17],n[13]=r[10]*t[3]+r[11]*t[8]+r[12]*t[13]+r[13]*t[18],n[14]=r[10]*t[4]+r[11]*t[9]+r[12]*t[14]+r[13]*t[19]+r[14],n[15]=r[15]*t[0]+r[16]*t[5]+r[17]*t[10]+r[18]*t[15],n[16]=r[15]*t[1]+r[16]*t[6]+r[17]*t[11]+r[18]*t[16],n[17]=r[15]*t[2]+r[16]*t[7]+r[17]*t[12]+r[18]*t[17],n[18]=r[15]*t[3]+r[16]*t[8]+r[17]*t[13]+r[18]*t[18],n[19]=r[15]*t[4]+r[16]*t[9]+r[17]*t[14]+r[18]*t[19]+r[19],n}_colorMatrix(n){const r=new Float32Array(n);return r[4]/=255,r[9]/=255,r[14]/=255,r[19]/=255,r}brightness(n,r){const t=[n,0,0,0,0,0,n,0,0,0,0,0,n,0,0,0,0,0,1,0];this._loadMatrix(t,r)}tint(n,r){const[t,o,e]=f.shared.setValue(n).toArray(),i=[t,0,0,0,0,0,o,0,0,0,0,0,e,0,0,0,0,0,1,0];this._loadMatrix(i,r)}greyscale(n,r){const t=[n,n,n,0,0,n,n,n,0,0,n,n,n,0,0,0,0,0,1,0];this._loadMatrix(t,r)}grayscale(n,r){this.greyscale(n,r)}blackAndWhite(n){const r=[.3,.6,.1,0,0,.3,.6,.1,0,0,.3,.6,.1,0,0,0,0,0,1,0];this._loadMatrix(r,n)}hue(n,r){n=(n||0)/180*Math.PI;const t=Math.cos(n),o=Math.sin(n),e=Math.sqrt,i=1/3,l=e(i),s=t+(1-t)*i,u=i*(1-t)-l*o,c=i*(1-t)+l*o,a=i*(1-t)+l*o,x=t+i*(1-t),m=i*(1-t)-l*o,p=i*(1-t)-l*o,M=i*(1-t)+l*o,h=t+i*(1-t),v=[s,u,c,0,0,a,x,m,0,0,p,M,h,0,0,0,0,0,1,0];this._loadMatrix(v,r)}contrast(n,r){const t=(n||0)+1,o=-.5*(t-1),e=[t,0,0,0,o,0,t,0,0,o,0,0,t,0,o,0,0,0,1,0];this._loadMatrix(e,r)}saturate(n=0,r){const t=n*2/3+1,o=(t-1)*-.5,e=[t,o,o,0,0,o,t,o,0,0,o,o,t,0,0,0,0,0,1,0];this._loadMatrix(e,r)}desaturate(){this.saturate(-1)}negative(n){const r=[-1,0,0,1,0,0,-1,0,1,0,0,0,-1,1,0,0,0,0,1,0];this._loadMatrix(r,n)}sepia(n){const r=[.393,.7689999,.18899999,0,0,.349,.6859999,.16799999,0,0,.272,.5339999,.13099999,0,0,0,0,0,1,0];this._loadMatrix(r,n)}technicolor(n){const r=[1.9125277891456083,-.8545344976951645,-.09155508482755585,0,11.793603434377337,-.3087833385928097,1.7658908555458428,-.10601743074722245,0,-70.35205161461398,-.231103377548616,-.7501899197440212,1.847597816108189,0,30.950940869491138,0,0,0,1,0];this._loadMatrix(r,n)}polaroid(n){const r=[1.438,-.062,-.062,0,0,-.122,1.378,-.122,0,0,-.016,-.016,1.483,0,0,0,0,0,1,0];this._loadMatrix(r,n)}toBGR(n){const r=[0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0];this._loadMatrix(r,n)}kodachrome(n){const r=[1.1285582396593525,-.3967382283601348,-.03992559172921793,0,63.72958762196502,-.16404339962244616,1.0835251566291304,-.05498805115633132,0,24.732407896706203,-.16786010706155763,-.5603416277695248,1.6014850761964943,0,35.62982807460946,0,0,0,1,0];this._loadMatrix(r,n)}browni(n){const r=[.5997023498159715,.34553243048391263,-.2708298674538042,0,47.43192855600873,-.037703249837783157,.8609577587992641,.15059552388459913,0,-36.96841498319127,.24113635128153335,-.07441037908422492,.44972182064877153,0,-7.562075277591283,0,0,0,1,0];this._loadMatrix(r,n)}vintage(n){const r=[.6279345635605994,.3202183420819367,-.03965408211312453,0,9.651285835294123,.02578397704808868,.6441188644374771,.03259127616149294,0,7.462829176470591,.0466055556782719,-.0851232987247891,.5241648018700465,0,5.159190588235296,0,0,0,1,0];this._loadMatrix(r,n)}colorTone(n,r,t,o,e){n||(n=.2),r||(r=.15),t||(t=16770432),o||(o=3375104);const i=f.shared,[l,s,u]=i.setValue(t).toArray(),[c,a,x]=i.setValue(o).toArray(),m=[.3,.59,.11,0,0,l,s,u,n,0,c,a,x,r,0,l-c,s-a,u-x,0,0];this._loadMatrix(m,e)}night(n,r){n||(n=.1);const t=[n*-2,-n,0,0,0,-n,0,n,0,0,0,n,n*2,0,0,0,0,0,1,0];this._loadMatrix(t,r)}predator(n,r){const t=[11.224130630493164*n,-4.794486999511719*n,-2.8746118545532227*n,0*n,.40342438220977783*n,-3.6330697536468506*n,9.193157196044922*n,-2.951810836791992*n,0*n,-1.316135048866272*n,-3.2184197902679443*n,-4.2375030517578125*n,7.476448059082031*n,0*n,.8044459223747253*n,0,0,0,1,0];this._loadMatrix(t,r)}lsd(n){const r=[2,-.4,.5,0,0,-.5,2,-.4,0,0,-.4,-.5,3,0,0,0,0,0,1,0];this._loadMatrix(r,n)}reset(){const n=[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];this._loadMatrix(n,!1)}get matrix(){return this.resources.colorMatrixUniforms.uniforms.uColorMatrix}set matrix(n){this.resources.colorMatrixUniforms.uniforms.uColorMatrix=n}get alpha(){return this.resources.colorMatrixUniforms.uniforms.uAlpha}set alpha(n){this.resources.colorMatrixUniforms.uniforms.uAlpha=n}}export{V as C};
