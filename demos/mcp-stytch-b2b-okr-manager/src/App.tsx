import {BrowserRouter as Router, Route, Routes, Navigate} from 'react-router-dom';
import {StytchB2BProvider} from "@stytch/react/b2b";
import {StytchB2BUIClient} from "@stytch/vanilla-js/b2b";

import OKREditor from "./OKREditor.tsx";
import {Authorize, Login, MemberSettings, Nav, OrgSettings, SSOSettings} from "./Auth.tsx";

const stytch = new StytchB2BUIClient(import.meta.env.VITE_STYTCH_PUBLIC_TOKEN);

function App() {
    return (
        <StytchB2BProvider stytch={stytch}>
            <Router>
                <Nav />
                <Routes>
                    <Route path="/login" element={<Login/>}/>
                    <Route path="/oauth/authorize" element={<Authorize/>}/>
                    <Route path="/authenticate" element={<Login/>}/>

                    <Route path="/okrs" element={<OKREditor/>}/>

                    <Route path="/settings/sso" element={<SSOSettings/>}/>
                    <Route path="/settings/organization" element={<OrgSettings/>}/>
                    <Route path="/settings/members" element={<MemberSettings/>}/>

                    <Route path="*" element={<Navigate to="/okrs"/>}/>
                </Routes>
            </Router>
        </StytchB2BProvider>
    )
}

export default App

