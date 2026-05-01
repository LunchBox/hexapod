import { useState } from 'react';
import { HexapodProvider } from './context/HexapodContext';
import SceneCanvas from './components/SceneCanvas';
import SceneControls from './components/SceneControls';
import Toolbar from './components/Toolbar';
import ControlPanel from './components/ControlPanel';
import ServoPanel from './components/ServoPanel';
import AttributesPanel from './components/AttributesPanel';
import StatusPanel from './components/StatusPanel';
import CommandDisplay from './components/CommandDisplay';
import TimeChart from './components/TimeChart';
import './App.css';
import '../stylesheets/application.css';

const TABS = [
  { id: 'move_control', label: 'Control' },
  { id: 'servo_control', label: 'Servos' },
  { id: 'attrs_control', label: 'Attributes' },
  { id: 'status_control', label: 'Status' },
];

function App() {
  const [activeTab, setActiveTab] = useState('move_control');

  return (
    <HexapodProvider>
      <div className="app">
        <h2 className="app-title">JS Hexapod Ver. 0.7.10 - developing (React)</h2>

        <div className="grid-scene">
          <SceneCanvas />
          <SceneControls />
        </div>

        <div className="grid-controls">
          <Toolbar />
          <div className="tab" style={{ marginBottom: 10 }}>
            {TABS.map((tab) => (
              <a
                key={tab.id}
                href="#"
                className={`tab-item${activeTab === tab.id ? ' active' : ''}`}
                onClick={(e) => { e.preventDefault(); setActiveTab(tab.id); }}
              >
                {tab.label}
              </a>
            ))}
          </div>

          {activeTab === 'move_control' && (
            <div className="tab_content active">
              <ControlPanel />
            </div>
          )}
          {activeTab === 'servo_control' && (
            <div className="tab_content active">
              <ServoPanel />
            </div>
          )}
          {activeTab === 'attrs_control' && (
            <div className="tab_content active">
              <AttributesPanel />
            </div>
          )}
          {activeTab === 'status_control' && (
            <div className="tab_content active">
              <StatusPanel />
            </div>
          )}
        </div>

        <div className="grid-info">
          <TimeChart />
          <CommandDisplay />

          <div className="app-footer">
            <div>
              Old version video: <a href="https://www.youtube.com/watch?v=2jqCGz36oH4">Youtube</a>
            </div>

            <div>
              <p>For connecting to your physical bot:</p>
              <ul>
                <li>Install <a href="http://nodejs.org/">Node.js</a></li>
                <li>Download the <a href="node_server/server.js">server.js</a> (it is a nodejs module)</li>
                <li>Connect your bot to some COM port</li>
                <li>run the server.js by typing "node PATH/TO/YOUR/server.js" and follow the instruction</li>
                <li>no guarantee it works...</li>
              </ul>
            </div>

            <p>
              Thanks to the author:
              <a href="http://freespace.virgin.net/hugo.elias/models/m_ik2.htm">
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
