// Top-level app — Huginn & Muninn (single mode)

const { useState: useS_App, useEffect: useE_App } = React;

const TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "primaryColor": "#10B981",
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAKS);

  return (
    <div
      className="app"
      data-density={tweaks.density}
      data-sidebar="expanded"
      data-app="hm"
      data-theme={tweaks.theme}
      style={{ "--primary-50": tweaks.primaryColor }}
    >
      <HmApp/>

      <TweaksPanel title="Tweaks">
        <TweakSection title="테마">
          <TweakRadio label="모드" value={tweaks.theme} onChange={v => setTweak("theme", v)}
            options={[{value:"light",label:"Light"},{value:"dark",label:"Dark"}]}/>
          <TweakColor label="Primary" value={tweaks.primaryColor} onChange={v => setTweak("primaryColor", v)}/>
          <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
            {["#10B981","#34D399","#059669","#047857"].map(c => (
              <button key={c} onClick={() => setTweak("primaryColor", c)}
                style={{width:24,height:24,borderRadius:6,border: tweaks.primaryColor===c?"2px solid var(--on-surface)":"1px solid var(--border)",background:c,cursor:"pointer"}}/>
            ))}
          </div>
        </TweakSection>
        <TweakSection title="레이아웃">
          <TweakRadio label="Density" value={tweaks.density} onChange={v => setTweak("density", v)}
            options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Comfy"},{value:"spacious",label:"Spacious"}]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
