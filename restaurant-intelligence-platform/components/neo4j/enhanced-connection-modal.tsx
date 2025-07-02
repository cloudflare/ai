'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Database, Upload, Key, Server, CheckCircle, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { testNeo4jConnection, parseConnectionString } from '@/lib/utils/neo4j-driver';

interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

interface EnhancedConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (config: Neo4jConnectionConfig) => void;
  initialConfig?: Partial<Neo4jConnectionConfig>;
}

interface ConnectionFile {
  name: string;
  content: string;
  type: 'env' | 'config' | 'json';
  parsedConfig?: Partial<Neo4jConnectionConfig>;
}

export const EnhancedConnectionModal: React.FC<EnhancedConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  initialConfig
}) => {
  const [activeTab, setActiveTab] = useState('manual');
  const [config, setConfig] = useState<Neo4jConnectionConfig>({
    uri: initialConfig?.uri || 'bolt://localhost:7687',
    username: initialConfig?.username || 'neo4j',
    password: initialConfig?.password || '',
    database: initialConfig?.database || 'neo4j'
  });
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<ConnectionFile[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const connectionFile: ConnectionFile = {
          name: file.name,
          content,
          type: 'config',
          parsedConfig: {}
        };

        // Parse file based on extension
        if (file.name.endsWith('.env')) {
          connectionFile.type = 'env';
          const lines = content.split('\n');
          lines.forEach(line => {
            const [key, value] = line.split('=').map(s => s.trim());
            if (key === 'NEO4J_URI') connectionFile.parsedConfig!.uri = value;
            if (key === 'NEO4J_USERNAME') connectionFile.parsedConfig!.username = value;
            if (key === 'NEO4J_PASSWORD') connectionFile.parsedConfig!.password = value;
            if (key === 'NEO4J_DATABASE') connectionFile.parsedConfig!.database = value;
          });
        } else if (file.name.endsWith('.json')) {
          connectionFile.type = 'json';
          try {
            const json = JSON.parse(content);
            connectionFile.parsedConfig = {
              uri: json.uri || json.neo4j?.uri,
              username: json.username || json.neo4j?.username,
              password: json.password || json.neo4j?.password,
              database: json.database || json.neo4j?.database
            };
          } catch (error) {
            console.error('Error parsing JSON:', error);
          }
        }

        setUploadedFiles(prev => [...prev, connectionFile]);
        
        // Auto-fill form if config was parsed
        if (connectionFile.parsedConfig && Object.keys(connectionFile.parsedConfig).length > 0) {
          setConfig(prev => ({ ...prev, ...connectionFile.parsedConfig }));
          toast.success(`Configuration loaded from ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.env', '.txt'],
      'application/json': ['.json']
    },
    multiple: true
  });

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionStatus('testing');
    setErrorMessage('');

    try {
      // Test connection
      const isValid = await testNeo4jConnection(config);
      
      if (isValid) {
        setConnectionStatus('connected');
        toast.success('Successfully connected to Neo4j');
        
        // Save to localStorage for persistence
        localStorage.setItem('neo4j_config', JSON.stringify(config));
        
        // Call parent callback
        onConnect(config);
        
        // Close modal after short delay
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to connect to Neo4j');
      toast.error('Failed to connect to Neo4j');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleQuickConnect = (preset: 'local' | 'aura' | 'sandbox') => {
    const presets = {
      local: {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        database: 'neo4j'
      },
      aura: {
        uri: 'neo4j+s://',
        username: 'neo4j',
        database: 'neo4j'
      },
      sandbox: {
        uri: 'bolt://',
        username: 'neo4j',
        database: 'neo4j'
      }
    };

    setConfig(prev => ({ ...prev, ...presets[preset] }));
    setActiveTab('manual');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Connect to Neo4j Database
          </DialogTitle>
          <DialogDescription>
            Configure your Neo4j database connection using manual settings or upload a configuration file
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual Configuration</TabsTrigger>
            <TabsTrigger value="upload">Upload Config</TabsTrigger>
            <TabsTrigger value="quick">Quick Connect</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="uri" className="flex items-center gap-2">
                <Server className="w-4 h-4" />
                Connection URI
              </Label>
              <Input
                id="uri"
                value={config.uri}
                onChange={(e) => setConfig(prev => ({ ...prev, uri: e.target.value }))}
                placeholder="bolt://localhost:7687 or neo4j+s://xxx.databases.neo4j.io"
              />
              <p className="text-xs text-muted-foreground">
                Use bolt:// for local instances or neo4j+s:// for Aura
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Username
              </Label>
              <Input
                id="username"
                value={config.username}
                onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder="neo4j"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={config.password}
                onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter your password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="database" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Database (optional)
              </Label>
              <Input
                id="database"
                value={config.database}
                onChange={(e) => setConfig(prev => ({ ...prev, database: e.target.value }))}
                placeholder="neo4j"
              />
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-lg font-medium">Drop the files here...</p>
              ) : (
                <>
                  <p className="text-lg font-medium mb-2">
                    Drag & drop configuration files here
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    or click to select files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports .env, .json, and .txt files with Neo4j credentials
                  </p>
                </>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium">Uploaded Files:</h4>
                {uploadedFiles.map((file, index) => (
                  <Card key={index} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium">{file.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {file.type.toUpperCase()}
                        </Badge>
                      </div>
                      {file.parsedConfig && Object.keys(file.parsedConfig).length > 0 && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    {file.parsedConfig && Object.keys(file.parsedConfig).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Loaded: {Object.keys(file.parsedConfig).join(', ')}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quick" className="mt-4">
            <div className="grid gap-4">
              <Card 
                className="p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleQuickConnect('local')}
              >
                <h4 className="font-medium mb-2">Local Neo4j Instance</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Connect to Neo4j running on your local machine
                </p>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  bolt://localhost:7687
                </code>
              </Card>

              <Card 
                className="p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleQuickConnect('aura')}
              >
                <h4 className="font-medium mb-2">Neo4j Aura</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Connect to a cloud-hosted Neo4j Aura database
                </p>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  neo4j+s://xxx.databases.neo4j.io
                </code>
              </Card>

              <Card 
                className="p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleQuickConnect('sandbox')}
              >
                <h4 className="font-medium mb-2">Neo4j Sandbox</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Connect to a Neo4j Sandbox instance
                </p>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  bolt://xxx.graphdatabase.io:7687
                </code>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {connectionStatus === 'error' && errorMessage && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {connectionStatus === 'connected' && (
          <Alert className="mt-4 border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              Successfully connected to Neo4j database!
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isConnecting}>
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={isConnecting || !config.password}>
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Connect
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};