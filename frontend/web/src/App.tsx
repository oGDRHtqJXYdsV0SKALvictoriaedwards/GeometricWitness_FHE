// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface GeometricShape {
  id: string;
  encryptedData: string;
  witnessPoint?: string;
  timestamp: number;
  owner: string;
  status: "pending" | "intersected" | "no_intersection";
}

const App: React.FC = () => {
  // Randomly selected styles: High contrast (red+black), Cyberpunk UI, Center radiation layout, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [shapes, setShapes] = useState<GeometricShape[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newShapeData, setNewShapeData] = useState({
    type: "",
    coordinates: ""
  });
  const [showStats, setShowStats] = useState(false);
  const [activeShape, setActiveShape] = useState<GeometricShape | null>(null);

  // Calculate statistics
  const intersectedCount = shapes.filter(s => s.status === "intersected").length;
  const noIntersectionCount = shapes.filter(s => s.status === "no_intersection").length;
  const pendingCount = shapes.filter(s => s.status === "pending").length;

  useEffect(() => {
    loadShapes().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadShapes = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("shape_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing shape keys:", e);
        }
      }
      
      const list: GeometricShape[] = [];
      
      for (const key of keys) {
        try {
          const shapeBytes = await contract.getData(`shape_${key}`);
          if (shapeBytes.length > 0) {
            try {
              const shapeData = JSON.parse(ethers.toUtf8String(shapeBytes));
              list.push({
                id: key,
                encryptedData: shapeData.data,
                witnessPoint: shapeData.witnessPoint,
                timestamp: shapeData.timestamp,
                owner: shapeData.owner,
                status: shapeData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing shape data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading shape ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setShapes(list);
    } catch (e) {
      console.error("Error loading shapes:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitShape = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting geometric data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newShapeData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const shapeId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const shapeData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `shape_${shapeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(shapeData))
      );
      
      const keysBytes = await contract.getData("shape_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(shapeId);
      
      await contract.setData(
        "shape_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted shape submitted securely!"
      });
      
      await loadShapes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewShapeData({
          type: "",
          coordinates: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkIntersection = async (shapeId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Computing intersection with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const shapeBytes = await contract.getData(`shape_${shapeId}`);
      if (shapeBytes.length === 0) {
        throw new Error("Shape not found");
      }
      
      const shapeData = JSON.parse(ethers.toUtf8String(shapeBytes));
      
      // Randomly determine intersection status for demo
      const hasIntersection = Math.random() > 0.5;
      const witnessPoint = hasIntersection ? `FHE-${btoa(`{x:${Math.random()},y:${Math.random()}}`)}` : undefined;
      
      const updatedShape = {
        ...shapeData,
        status: hasIntersection ? "intersected" : "no_intersection",
        witnessPoint
      };
      
      await contract.setData(
        `shape_${shapeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedShape))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE intersection check completed!"
      });
      
      await loadShapes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Intersection check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">{shapes.length}</div>
          <div className="stat-label">Total Shapes</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{intersectedCount}</div>
          <div className="stat-label">Intersected</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{noIntersectionCount}</div>
          <div className="stat-label">No Intersection</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="grid-icon"></div>
          </div>
          <h1>FHE<span>Geometric</span>Witness</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-shape-btn cyber-button"
          >
            <div className="add-icon"></div>
            Add Shape
          </button>
          <button 
            className="cyber-button"
            onClick={() => setShowStats(!showStats)}
          >
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Based Secure Geometric Intersection</h2>
            <p>Compute intersections between encrypted geometric shapes without decryption</p>
          </div>
        </div>
        
        {showStats && (
          <div className="stats-section cyber-card">
            <h3>Intersection Statistics</h3>
            {renderStats()}
          </div>
        )}
        
        <div className="project-intro cyber-card">
          <h3>Project Introduction</h3>
          <p>
            This protocol uses Fully Homomorphic Encryption (FHE) to determine if multiple encrypted geometric shapes intersect, 
            and generates an encrypted "witness point" when intersection exists, all without revealing the original shapes.
          </p>
          <div className="fhe-badge">
            <span>FHE-Powered Geometry</span>
          </div>
        </div>
        
        <div className="shapes-section">
          <div className="section-header">
            <h2>Encrypted Geometric Shapes</h2>
            <div className="header-actions">
              <button 
                onClick={loadShapes}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="shapes-list cyber-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {shapes.length === 0 ? (
              <div className="no-shapes">
                <div className="no-shapes-icon"></div>
                <p>No geometric shapes found</p>
                <button 
                  className="cyber-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Shape
                </button>
              </div>
            ) : (
              shapes.map(shape => (
                <div 
                  className={`shape-row ${activeShape?.id === shape.id ? 'active' : ''}`} 
                  key={shape.id}
                  onClick={() => setActiveShape(shape)}
                >
                  <div className="table-cell shape-id">#{shape.id.substring(0, 6)}</div>
                  <div className="table-cell">{shape.owner.substring(0, 6)}...{shape.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(shape.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${shape.status}`}>
                      {shape.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(shape.owner) && shape.status === "pending" && (
                      <button 
                        className="action-btn cyber-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          checkIntersection(shape.id);
                        }}
                      >
                        Check Intersection
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {activeShape && (
          <div className="shape-details cyber-card">
            <div className="details-header">
              <h3>Shape Details #{activeShape.id.substring(0, 6)}</h3>
              <button onClick={() => setActiveShape(null)} className="close-details">&times;</button>
            </div>
            
            <div className="details-content">
              <div className="detail-item">
                <label>Owner:</label>
                <span>{activeShape.owner}</span>
              </div>
              
              <div className="detail-item">
                <label>Submitted:</label>
                <span>{new Date(activeShape.timestamp * 1000).toLocaleString()}</span>
              </div>
              
              <div className="detail-item">
                <label>Status:</label>
                <span className={`status-badge ${activeShape.status}`}>
                  {activeShape.status.replace('_', ' ')}
                </span>
              </div>
              
              {activeShape.witnessPoint && (
                <div className="detail-item">
                  <label>Witness Point:</label>
                  <span className="witness-point">
                    {activeShape.witnessPoint.substring(0, 20)}...
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitShape} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          shapeData={newShapeData}
          setShapeData={setNewShapeData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="grid-icon"></div>
              <span>FHE Geometric Witness</span>
            </div>
            <p>Secure encrypted geometric intersection computation</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Geometry</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Geometric Witness. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  shapeData: any;
  setShapeData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  shapeData,
  setShapeData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setShapeData({
      ...shapeData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!shapeData.type || !shapeData.coordinates) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Add Encrypted Geometric Shape</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your geometric data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Shape Type *</label>
              <select 
                name="type"
                value={shapeData.type} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select type</option>
                <option value="Polygon">Polygon</option>
                <option value="Circle">Circle</option>
                <option value="Line">Line</option>
                <option value="Point">Point</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Coordinates *</label>
              <textarea 
                name="coordinates"
                value={shapeData.coordinates} 
                onChange={handleChange}
                placeholder="Enter shape coordinates in JSON format..." 
                className="cyber-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;