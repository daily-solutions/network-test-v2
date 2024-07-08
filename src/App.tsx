import React, { useState } from "react";
import "./App.css";
import { useDaily } from "@daily-co/daily-react";
import {
  DailyCallQualityTestResults,
  DailyWebsocketConnectivityTestResults,
} from "@daily-co/daily-js";
type State =
  | "idle"
  | "starting_call_quality"
  | "running_call_quality"
  | "finished_call_quality"
  | "starting_network_connectivity"
  | "running_network_connectivity"
  | "finished_network_connectivity"
  | "running_websocket_connectivity"
  | "finished_websocket_connectivity";

function App() {
  const daily = useDaily();
  const [state, setState] = useState<State>("idle");
  const [callQuality, setCallQuality] =
    useState<DailyCallQualityTestResults | null>(null);
  const [websocketConnectivity, setWebsocketConnectivity] =
    useState<DailyWebsocketConnectivityTestResults | null>(null);

  async function startCallQuality() {
    setState("starting_call_quality");

    await daily?.preAuth({ url: "https://chad-hq.daily.co/howdy" });
    // await daily?.startCamera();
    console.log("camera started; starting call quality test");
    setState("running_call_quality");

    const cq = await daily?.testCallQuality();
    if (cq) {
      console.log({ cq });
      setCallQuality(cq);
    }
    setState("finished_call_quality");
  }

  async function stopCallQuality() {
    await daily?.stopTestCallQuality();
  }

  async function startNetworkConnectivity() {
    setState("starting_network_connectivity");
    //const nc = await daily?.testNetworkConnectivity();
  }

  async function startWebsocketConnectivity() {
    setState("running_websocket_connectivity");
    const wsc = await daily?.testWebsocketConnectivity();
    if (wsc) {
      setWebsocketConnectivity(wsc);
    }
    setState("finished_websocket_connectivity");
  }

  function callQualityResultDescription() {
    switch (callQuality?.result) {
      case "aborted":
        return "Test aborted before any data was gathered.";
      case "failed":
        return "Test ended in error.";
      case "bad":
        return "Your internet connection seems slow or unreliable. Try a different network.";
      case "warning":
        return "Calls will work, but video and audio might be choppy.";
      default:
        return "Unknown.";
      case "good":
        return "Your internet connection is good.";
    }
  }

  switch (state) {
    case "starting_call_quality":
      return <h2>Starting call quality test, please wait a few seconds...</h2>;
    case "starting_network_connectivity":
      return (
        <h2>
          Starting network connectivity test, please wait a few seconds...
        </h2>
      );
    case "running_websocket_connectivity":
      return (
        <h2>
          Running websocket connectivity test, please wait a few seconds...
        </h2>
      );
    case "running_call_quality":
      return (
        <div>
          <h2>Running call quality test.</h2>
          <p>
            This usually takes about 30 seconds. It will complete automatically,
            but you can stop it early with this button:
          </p>
          <button
            onClick={() => {
              stopCallQuality();
            }}
          >
            Stop Test
          </button>
        </div>
      );
    case "finished_call_quality":
      return (
        <div>
          <h2>Finished Call Quality test</h2>
          <p>Result: {callQualityResultDescription()}</p>
          <p>You can run other tests too:</p>
          <button
            onClick={() => {
              startNetworkConnectivity();
            }}
          >
            Network Connectivity
          </button>
          <button
            onClick={() => {
              startWebsocketConnectivity();
            }}
          >
            Websocket Connectivity
          </button>
        </div>
      );
    case "finished_websocket_connectivity":
      return (
        <div>
          <h2>Websocket Connectivity Results</h2>
          <p>{JSON.stringify(websocketConnectivity)}</p>
        </div>
      );
    default:
      return (
        <div>
          <h1>Network Test</h1>
          <button
            onClick={() => {
              startCallQuality();
            }}
          >
            Start Test
          </button>
        </div>
      );
  }
}

export default App;
