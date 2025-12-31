import {BrowserRouter as Router, Route, Routes, Navigate} from 'react-router-dom';

import TodoEditor from "./Todos.tsx";
import {Authenticate, Authorize, Login, Logout} from "./Auth.tsx";

function App() {
    return (
        <>
            <main>
                <h1>TODO App MCP Demo</h1>
                <Router>
                    <Routes>
                        <Route path="/oauth/authorize" element={<Authorize/>}/>
                        <Route path="/login" element={<Login/>}/>
                        <Route path="/authenticate" element={<Authenticate/>}/>
                        <Route path="/todoapp" element={<TodoEditor/>}/>
                        <Route path="*" element={<Navigate to="/todoapp"/>}/>
                    </Routes>
                </Router>
            </main>
            <footer>
                <Logout/>
            </footer>
        </>
    )
}

export default App

