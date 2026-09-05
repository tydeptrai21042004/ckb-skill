import React from "react";
import ReactDOM from "react-dom/client";
import { ccc } from "@ckb-ccc/connector-react";
import App from "./App";
import "./styles.css";

const testnetClient = new ccc.ClientPublicTestnet();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ccc.Provider
      name="SkillPass"
      defaultClient={testnetClient}
      clientOptions={[{ name: "CKB Testnet", client: testnetClient }]}
      signerFilter={async (signerInfo) => signerInfo.signer.type === ccc.SignerType.CKB}
    >
      <App />
    </ccc.Provider>
  </React.StrictMode>,
);
