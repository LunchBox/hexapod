import { useState, useEffect } from 'react';
import { HexapodProvider } from './context/HexapodContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SceneCanvas from './components/SceneCanvas';
import SceneControls from './components/SceneControls';
import ControlPanel from './components/ControlPanel';
import ServoPanel from './components/ServoPanel';
import AttributesPanel from './components/AttributesPanel';
import LegAttributesPanel from './components/LegAttributesPanel';
import StatusPanel from './components/StatusPanel';
import CommandDisplay from './components/CommandDisplay';
import TimeChart from './components/TimeChart';
import StatusBar from './components/StatusBar';
import Toolbar from './components/Toolbar';
import './App.css';

const TABS = [
  { id: 'move_control', label: 'Control' },
  { id: 'servo_control', label: 'Servos' },
  { id: 'attrs_control', label: 'Body' },
  { id: 'leg_control', label: 'Leg' },
  { id: 'status_control', label: 'Status' },
];

function ago(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}

function SaveIndicator() {
  const [saveTime, setSaveTime] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => setSaveTime((e as CustomEvent).detail);
    window.addEventListener('bot-options-saved', handler);
    return () => window.removeEventListener('bot-options-saved', handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={`text-[10px] ml-auto transition-colors ${saveTime ? 'text-emerald-600' : 'text-transparent'}`}
      title={saveTime ? new Date(saveTime).toLocaleTimeString() : ''}>
      {saveTime ? `saved ${ago(Date.now() - saveTime)}` : ''}
    </span>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('move_control');

  return (
    <HexapodProvider>
      <div className="app p-4">
        <h2 className="app-title text-lg font-semibold tracking-tight py-1">JS Hexapod ver.0.8.0</h2>

        <div className="grid-status">
          <StatusBar />
          <Toolbar />
          <SaveIndicator />
        </div>

        <div className="grid-scene">
          <SceneCanvas />
          <SceneControls />
        </div>

        <div className="grid-controls">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="flex-1 text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="move_control" className="mt-3">
              <ControlPanel />
            </TabsContent>
            <TabsContent value="servo_control" className="mt-3">
              <ServoPanel />
            </TabsContent>
            <TabsContent value="attrs_control" className="mt-3">
              <AttributesPanel />
            </TabsContent>
            <TabsContent value="leg_control" className="mt-3">
              <LegAttributesPanel />
            </TabsContent>
            <TabsContent value="status_control" className="mt-3">
              <StatusPanel />
            </TabsContent>
          </Tabs>
        </div>

        <div className="grid-info">
          <TimeChart />
          <CommandDisplay />

          <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground space-y-3">
            <div>
              Old version video: <a href="https://www.youtube.com/watch?v=2jqCGz36oH4" className="underline">Youtube</a>
            </div>

            <div>
              <p>For connecting to your physical bot:</p>
              <ul className="list-disc pl-4">
                <li>Install <a href="http://nodejs.org/" className="underline">Node.js</a></li>
                <li>Download the <a href="node_server/server.js" className="underline">server.js</a> (it is a nodejs module)</li>
                <li>Connect your bot to some COM port</li>
                <li>run the server.js by typing "node PATH/TO/YOUR/server.js" and follow the instruction</li>
                <li>no guarantee it works...</li>
              </ul>
            </div>

            <p>
              Thanks to the author:
              <a href="http://freespace.virgin.net/hugo.elias/models/m_ik2.htm" className="underline">
                http://freespace.virgin.net/hugo.elias/models/m_ik2.htm
              </a>
            </p>

            <div>By Daniel Cheang @ 2015</div>
          </div>
        </div>
      </div>
    </HexapodProvider>
  );
}

export default App;
