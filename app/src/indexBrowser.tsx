import React, { useState } from "react";
import { createRoot } from 'react-dom/client';
import { ProofResponse, PaperproofWindow, ConvertedProofTree, Highlights, Arrow, HypNode, PaperproofAcquireVsCodeApi, Settings } from "types";
import "./index.css";
import "./css/coin-loading-icon.css";
import ProofTree from "./components/ProofTree";
import converter from "./services/converter";
import getHighlights from "./services/getHighlights";
import hypsToTables from "./services/hypsToTables";
import createHypArrows from './services/createHypArrows';
import PerfectArrow from "./components/PerfectArrow";

import Snackbar from '@mui/material/Snackbar';
import zoomOnNavigation from "./services/zoomOnNavigation";
import getStatement from "./services/getStatement";
import HypothesisNode from "./components/ProofTree/components/BoxEl/components/Hypotheses/components/HypothesisNode";
import zoomManually from "./services/zoomManually";

// Allowing certain properties on window
declare const window: PaperproofWindow;

declare const acquireVsCodeApi: PaperproofAcquireVsCodeApi;

// Get vscode API reference once
const vscode = acquireVsCodeApi();

interface GlobalContextType {
  UIVersion: number;
  refreshUI: () => void;
  collapsedBoxIds: string[];
  setCollapsedBoxIds: (x: string[]) => void;
  searchedHypIds: string[];
  setSearchedHypIds: (x: string[]) => void;
  settings: Settings;
  setSettings: (x: Settings) => void;
  proofTree: ConvertedProofTree;
  highlights: Highlights;
}

const GlobalContext = React.createContext<GlobalContextType | undefined>(undefined);

// This allows us to use `undefined` for the default GlobalContext value
// (see https://stackoverflow.com/a/69735347/3192470)
export const useGlobalContext = () => {
  const globalContext = React.useContext(GlobalContext);
  if (!globalContext)
      throw new Error('No <GlobalContext.Provider/> found when calling useGlobalContext.');
  return globalContext;
};

interface Converted {
  proofTree: ConvertedProofTree;
  highlights: Highlights;
  statement: string | null;
}

function Main() {
  const [converted, setConverted] = useState<Converted | null>(null);

  const [loadingAfterClick, setLoadingAfterClick] = useState<Boolean>(false);

  const [perfectArrows, setPerfectArrows] = useState<Arrow[]>([]);
  const [UIVersion, setUIVersion] = useState<number>(1);

  const [collapsedBoxIds, setCollapsedBoxIds] = useState<string[]>([]);
  const [searchedHypIds, setSearchedHypIds] = useState<string[]>([]);

  const [settings, setSettings] = useState(window.initialSettings);

  // We do need separate state vars for prettier animations
  const [snackbarMessage, setSnackbarMessage] = useState<String | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);

  const [idsOutsideViewport, setIdsOutsideViewport] = React.useState<string[]>([]);

  const updateUI = (proofResponse : ProofResponse) => {
    if ("error" in proofResponse) {
      if (proofResponse.error === 'File changed.' || proofResponse.error === 'stillTyping') {
        // This is a normal situation, just return.
      } else if (proofResponse.error.startsWith('wrongLeanExtensionVersion')) {
        const errorMessage = proofResponse.error.split('wrongLeanExtensionVersion: ')[1];
        setSnackbarMessage(errorMessage);
        setSnackbarOpen(true);
      } else if (proofResponse.error === 'leanNotYetRunning') {
        setSnackbarMessage("Waiting for Lean");
        setSnackbarOpen(true);
      } else if (proofResponse.error.startsWith("No RPC method")) {
        setSnackbarMessage(`Missing "import Paperproof" in this .lean file, please import it.`);
        setSnackbarOpen(true);
      } else if (proofResponse.error === 'zeroProofSteps') {
        setSnackbarMessage("Not within theorem");
        setSnackbarOpen(true);
      } else if (proofResponse.error.startsWith('no snapshot found at')) {
        setSnackbarMessage(`No snapshot found. <br/>Is your cursor located after <span style="color: #4791b8; padding: 4px 7px; background: #90969621; border-radius: 3px; font-size: 12px; font-family: monospace; font-weight: 600;">#exit</span>?`);
        setSnackbarOpen(true);
      } else {
        console.warn("We are not handling some error explicitly?", proofResponse);
      }
      return;
    }
    // Check version for compatibility
    const leanRpcVersion = proofResponse.version ?? 1;
    const desiredLeanRpcVersion = 2;
    if (leanRpcVersion !== desiredLeanRpcVersion) {
      setSnackbarMessage(`
        Your <b>Paperproof vscode extension</b> has version ${desiredLeanRpcVersion}, and <br/>
        your <b>Paperproof Lean library</b> has version ${leanRpcVersion}.<br/><br/>
        For Paperproof to work well, these versions must match.
        <br/>
        Please run <span style="color: #4791b8; padding: 4px 7px; background: #90969621; border-radius: 3px; font-size: 12px; font-family: monospace; font-weight: 600;">lake update Paperproof</span> to uprade the <b>Paperproof Lean library</b>.
        <br/><br/>

        <i style="color: #9d9d9e;">Explanation: these versions are independent from the paperproof vscode extension version numbers. We update these versions rather rarely, only when we update the response from our lean library in a manner incompatible with the way our vscode extension handles it.</i>
      `)
      setSnackbarOpen(true);
      return;
    }

    setSnackbarOpen(false);

    // ___Why don't we memoize these functions/avoid rerenders?
    //    These seem like expensive operations, however they aren't!
    //    The entire converter()+hypsToTables() process takes from 2ms to 5ms.
    //    The delay we see in the UI is coming from "Making getSnapshotData request" vscode rpc.
    const convertedProofTree : ConvertedProofTree = converter(proofResponse.proofTree);
    convertedProofTree.boxes.forEach((box) => {
      box.hypTables = hypsToTables(box.hypLayers, convertedProofTree)
    });
    const newHighlights = getHighlights(convertedProofTree.equivalentIds, proofResponse.goal);
    const currentStatement = getStatement(proofResponse.proofTree);

    setConverted({
      proofTree: convertedProofTree,
      highlights: newHighlights,
      statement: currentStatement,
    });
    setIdsOutsideViewport([]);
  }

  const updateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    vscode.postMessage({
      type: 'from_webview:update_settings',
      data: newSettings
    });
  };

  React.useEffect(() => {
    if (window.initialInfo) {
      const proofResponse : ProofResponse = window.initialInfo;
      updateUI(proofResponse);
    }

    const updateFromVscode = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'from_extension:update_settings') {
        setSettings(message.data);
      } else if (message.type === 'from_extension:sendPosition') {
        setLoadingAfterClick(false)
        const proofResponse : ProofResponse = message.data;
        updateUI(proofResponse);
      } else if (message.type === 'from_extension:start_loading') {
        setLoadingAfterClick(true)
      }
    };

    addEventListener('message', updateFromVscode);
    return () => removeEventListener('message', updateFromVscode);
  }, []);

  React.useLayoutEffect(() => {
    if (!converted) return;

    const newPerfectArrows = createHypArrows(converted.proofTree);
    setPerfectArrows(newPerfectArrows);

    zoomOnNavigation(converted.proofTree, converted.highlights?.goalId);
  }, [converted, UIVersion]);

  React.useEffect(() => {
    localStorage.removeItem('zoomedBoxId');
    setCollapsedBoxIds([]);
  }, [converted?.statement])

  const refreshUI = () => {
    setUIVersion((UIVersion) => UIVersion + 1);
  }

  // Evgenia: I commented this out, because it doesn't actually work very well - and it even tends to prevent me from seeing the proof tree.
  //
  // React.useLayoutEffect(() => {
  //   if (!converted || !converted.highlights) {
  //     return;
  //   }

  //   const highlightedHypEls = converted.highlights.hypIds
  //     .map((hypId) => document.getElementById(`hypothesis-${hypId}`))
  //     .filter((hypEl) => hypEl) as HTMLElement[];

  //   const observer = new IntersectionObserver((entries) => {
  //     setIdsOutsideViewport((outsiderIds) => {
  //       let newIdsOutsideViewport = [...outsiderIds];
  //       entries.forEach((entry) => {
  //         const hypId = entry.target.id.replace('hypothesis-', '');
  //         if (outsiderIds.includes(hypId) && entry.isIntersecting) {
  //           newIdsOutsideViewport = newIdsOutsideViewport.filter((id) => id !== hypId);
  //         } else if (!outsiderIds.includes(hypId) && !entry.isIntersecting) {
  //           newIdsOutsideViewport.push(hypId);
  //         }
  //       });
  //       return newIdsOutsideViewport;
  //     });
  //   }, { threshold: 1.0 });

  //   highlightedHypEls.forEach((hypEl) => observer.observe(hypEl));

  //   return () => { observer.disconnect() };
  // }, [converted]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "≠") {
        event.stopPropagation();
        zoomManually("in");
      } else if (event.altKey && event.key === "–") {
        zoomManually("out");
      }
    };

    addEventListener('keydown', handleKeyDown);

    return () => {
      removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  let displayHyps : HypNode[] = []; 
  if (converted && converted.highlights) {
    const allHyps = converted.proofTree.boxes
      .flatMap((box) => box.hypLayers.flatMap((hypLayer) => hypLayer.hypNodes))
      .filter((hyp) => hyp.isProof === "proof")
    displayHyps = idsOutsideViewport.map((id) => allHyps.find((hyp) => hyp.id === id)).filter((hyp) => hyp) as HypNode[];
  }

  const canWriteTactic = converted && converted.highlights &&
    !converted.proofTree.tactics.find((tactic) =>
      tactic.successGoalId === converted.highlights!.goalId ||
      tactic.goalArrows.find((goalArrow) => goalArrow.fromId === converted.highlights!.goalId)
    );

  return <>
    {
      converted &&
      <GlobalContext.Provider
        value={{
          UIVersion, refreshUI,
          collapsedBoxIds, setCollapsedBoxIds,
          searchedHypIds,  setSearchedHypIds,
          settings,        setSettings: updateSettings,

          proofTree: converted.proofTree,
          highlights: converted.highlights,
        }}
      >
        {
          canWriteTactic &&
          displayHyps.length > 0 &&
          <div className="in-scope-hypotheses">
            {displayHyps.map((hypNode) =>
              <HypothesisNode key={hypNode.id} hypNode={hypNode} withId={false}/>
            )}
          </div>
        }
        <div className={`
          proof-tree
          ${settings.isReadonlyMode    ? '-isReadonlyModeON'    : ''}
          ${settings.isCompactMode     ? '-isCompactModeON'     : ''}
          ${settings.isCompactTactics  ? '-isCompactTacticsON'  : '-isCompactTacticsOFF'}
          ${settings.isHiddenGoalNames ? '-isHiddenGoalNamesON' : ''}
          ${settings.isGreenHypotheses ? ''                     : '-isGreenHypothesesOFF'}
        `}>
          <ProofTree/>
          {perfectArrows.map((arrow, index) =>
            <PerfectArrow key={index} p1={arrow.from} p2={arrow.to}/>
          )}
        </div>
      </GlobalContext.Provider>
    }
    <Snackbar
      open={snackbarOpen}
      autoHideDuration={null}
      message={snackbarMessage && <div dangerouslySetInnerHTML={{ __html: snackbarMessage }}/>}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    />
    {
      loadingAfterClick &&
      <div className="coin-loading-icon"><div></div></div>
    }
  </>
}

const root = createRoot(document.getElementById("root")!);
root.render(<Main/>);
