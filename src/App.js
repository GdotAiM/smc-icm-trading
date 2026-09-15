import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>SMC ICM Trading GUI</h1>
        <p>Welcome to the Smart Money Concepts Trading Interface!</p>
        <button onClick={() => alert('Session started!')}>Start Trading Session</button>
        <button onClick={() => alert('Analyzing...')}>Run Analysis</button>
        <button onClick={() => alert('Fetching positions...')}>Check Positions</button>
      </header>
    </div>
  );
}

export default App;