import { useState } from 'react';
import { HexapodProvider } from './context/HexapodContext';
import SceneCanvas from './components/SceneCanvas';
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
        <h2>JS Hexapod Ver. 0.7.10 - developing (React)</h2>

        <SceneCanvas />

        <div className="main-content">
          <div className="left-column">
            <TimeChart />

            <CommandDisplay />
          </div>

          <div className="right-column">
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
        </div>
      </div>
    </HexapodProvider>
  );
}

export default App;
