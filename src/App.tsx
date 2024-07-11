import React, { useState } from "react";
import "./App.css";
import { useDaily } from "@daily-co/daily-react";
import {
  DailyCallQualityTestResults,
  DailyWebsocketConnectivityTestResults,
} from "@daily-co/daily-js";
import NetworkTester from "./NetworkTester.js";
import { connect } from "http2";

const CONNECTION_MODES = {
  ANY: "any", // used to gather all candidates
  STUN: "stun",
  TURN_UDP: "turn-udp",
  TURN_TCP: "turn-tcp",
  TURN_TLS: "turn-tls",
  RELAY_ONLY: "relay",
};

type State =
  | "idle"
  | "starting_call_quality"
  | "running_call_quality"
  | "finished_call_quality"
  | "starting_advanced"
  | "running_advanced"
  | "finished_advanced";

function App() {
  const daily = useDaily();
  const [state, setState] = useState<State>("idle");
  const [callQuality, setCallQuality] =
    useState<DailyCallQualityTestResults | null>(null);
  const [websocketConnectivity, setWebsocketConnectivity] =
    useState<DailyWebsocketConnectivityTestResults | null>(null);
  const [connectionState, setConnectionState] = useState({
    [CONNECTION_MODES.ANY]: {
      result: null,
      iceCandidates: null,
    },
    [CONNECTION_MODES.RELAY_ONLY]: {
      result: null,
      iceCandidates: null,
    },
    [CONNECTION_MODES.STUN]: {
      result: null,
      iceCandidates: null,
    },
    [CONNECTION_MODES.TURN_UDP]: {
      result: null,
      iceCandidates: null,
    },
    [CONNECTION_MODES.TURN_TCP]: {
      result: null,
      iceCandidates: null,
    },
    [CONNECTION_MODES.TURN_TLS]: {
      result: null,
      iceCandidates: null,
    },
  });
  async function startCallQuality() {
    setState("starting_call_quality");
    daily?.on("error", (e) => {
      console.log("got a daily-js error: ", e);
    });
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

  async function startAdvanced() {
    setState("starting_advanced");
    //const nc = await daily?.testNetworkConnectivity();
    const iceResp = await fetch("https://prod-ks.pluot.blue/tt-150331.json");
    const iceServers = await iceResp.json();
    setState("running_advanced");
    const promises = Object.keys(connectionState).map((test) =>
      initiateTester(test, iceServers)
    );
    promises.push(runWebsocketTest());
    await Promise.all(promises);
    setState("finished_advanced");
  }

  async function initiateTester(connectionMode: any, iceServers: any) {
    const instance = new NetworkTester({
      natService: "twilio",
      connectionMode,
      iceServers,
    });
    console.log("created test instance: ", instance);

    // instance.setupRTCPeerConnection().then((result) => {
    //   console.log("got a test result: ", result);
    //   setConnectionState((prevState) => ({
    //     ...prevState,
    //     [connectionMode]: {
    //       result: result.status,
    //       iceCandidates: result.iceCandidates,
    //     },
    //   }));
    // });
    const result = await instance.setupRTCPeerConnection();
    console.log("got a test result: ", result);
    setConnectionState((prevState) => ({
      ...prevState,
      [connectionMode]: {
        result: result.status,
        iceCandidates: result.iceCandidates,
      },
    }));
  }
  async function runWebsocketTest() {
    console.log("starting websocket test");
    const ws = await daily?.testWebsocketConnectivity();
    // .then((result) => {
    //   if (result) {
    //     setWebsocketConnectivity(result);
    //   }
    // });
    if (ws) {
      setWebsocketConnectivity(ws);
    }
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

  function websocketResults() {
    if (websocketConnectivity) {
      let results: JSX.Element[] = [];
      results.push(<strong>{websocketConnectivity.result}</strong>);
      if (
        websocketConnectivity?.failedRegions &&
        websocketConnectivity?.failedRegions.length > 0
      ) {
        const els = websocketConnectivity.failedRegions.map((r) => (
          <li>{r}</li>
        ));
        results.push(
          <p>
            <strong>Failed regions:</strong>
          </p>
        );
        results.push(<ul>{els}</ul>);
      }
      return <div>{results}</div>;
    } else {
      return <div>No results.</div>;
    }
  }

  function networkTestResults() {
    if (connectionState) {
      console.log({ connectionState });
      let results: JSX.Element[] = [];

      const all_results = Object.values(connectionState).map((e) => e.result);
      // Set removes duplicates
      const all_passed = all_results.every((e) => e == "connected");
      if (all_passed) {
        // Then everything connected; we can show simplified results
        results.push(<p>Passed!</p>);
      } else {
        const types = Object.entries(connectionState).map(([key, value]) => (
          <li>
            {key}: {value.result}
          </li>
        ));
        results.push(<ul>{types}</ul>);
      }
      // typescript weirdness
      const any_candidates: any = connectionState["any"];
      if (any_candidates["iceCandidates"]) {
        const ccc = any_candidates["iceCandidates"].map(
          (i: RTCIceCandidate) => <li>{i.candidate}</li>
        );
        results.push(<ul>{ccc}</ul>);
      }
      return <div>{results}</div>;
    } else {
      return <p>No results.</p>;
    }
  }

  switch (state) {
    case "starting_call_quality":
      return <h2>Starting call quality test, please wait a few seconds...</h2>;
    case "starting_advanced":
      return <h2>Starting advanced tests, please wait a few seconds...</h2>;
    case "running_advanced":
      return <h2>Running advanced tests, please wait a few seconds...</h2>;
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
              startAdvanced();
            }}
          >
            Advanced Tests
          </button>
        </div>
      );
    case "finished_advanced":
      return (
        <>
          <div>
            <h2>Websocket Connectivity Results</h2>
            <div>{websocketResults()}</div>
          </div>
          <div>
            <h2>Network Connectivity Results</h2>
            <div>{networkTestResults()}</div>
          </div>
        </>
      );
    default:
      return (
        <>
          <div>
            <h1>Call Test</h1>
            <button
              onClick={() => {
                startCallQuality();
              }}
            >
              Start Call Test
            </button>
          </div>
          <div>
            <h2>Connection Type Test</h2>
            <button
              onClick={() => {
                startAdvanced();
              }}
            >
              Start Network Test
            </button>
          </div>
        </>
      );
  }
}

export default App;
