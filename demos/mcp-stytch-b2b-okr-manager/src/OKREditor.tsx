import {useState, useEffect, FormEvent} from 'react';
import {hc} from 'hono/client';
import {useStytchOrganization, withStytchPermissions} from '@stytch/react/b2b';
import {OKRApp} from "../api/OKRAPI.ts";
import {withLoginRequired} from "./Auth.tsx";
import {KeyResult, Objective, Permissions} from "../types";
import {PermissionsMap} from "@stytch/core/public";
import {NavLink} from "react-router-dom";
import {CircleHelp, Pen, PlusCircle, TrashIcon} from "lucide-react";
import {Modal} from "./components/modal.tsx";


const client = hc<OKRApp>(`${window.location.origin}/api`);

// Objective and Key Result API actions
const getObjectives = () =>
    client.objectives.$get()
        .then(res => res.json())
        .then(res => res.objectives);

const createObjective = (objectiveText: string) =>
    client.objectives.$post({json: {objectiveText}})
        .then(res => res.json())
        .then(res => res.objectives);

const deleteObjective = (id: string) =>
    client.objectives[':okrID'].$delete({param: {okrID: id}})
        .then(res => res.json())
        .then(res => res.objectives);

const createKeyResult = (okrID: string, keyResultText: string) =>
    client.objectives[':okrID'].keyresults.$post({
        param: {okrID},
        // @ts-expect-error RPC inference is not working
        json: {keyResultText}
    })
        .then(res => res.json())
        .then(res => res.objectives);

const deleteKeyResult = (okrID: string, krID: string) =>
    client.objectives[':okrID'].keyresults[':krID'].$delete({
        param: {okrID, krID}
    })
        .then(res => res.json())
        .then(res => res.objectives);

const setKeyResultAttainment = (okrID: string, krID: string, attainment: number) =>
    client.objectives[':okrID'].keyresults[':krID'].attainment.$post({
        param: {okrID, krID},
        // @ts-expect-error RPC inference is not working
        json: {attainment}
    })
        .then(res => res.json())
        .then(res => res.objectives);


type KeyResultProps = {
    objective: Objective;
    keyResult: KeyResult,
    stytchPermissions: PermissionsMap<Permissions>;
    setObjectives: React.Dispatch<React.SetStateAction<Objective[]>>;
}

const KeyResultEditor = ({objective, keyResult, stytchPermissions, setObjectives}: KeyResultProps) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [attainment, setAttainment] = useState(keyResult.attainment);

    const onDeleteKeyResult = (okrID: string, krID: string) => {
        deleteKeyResult(okrID, krID).then(objectives => setObjectives(objectives));
    };

    const onSetKeyResultAttainment = (evt: FormEvent) => {
        evt.preventDefault()
        setKeyResultAttainment(objective.id, keyResult.id, attainment).then(objectives => setObjectives(objectives));
        setModalOpen(false);
    };

    const canEdit = stytchPermissions.key_result.update;
    const canDelete = stytchPermissions.key_result.delete;

    const fullyAttained = attainment >= 100;

    return (
        <li>
            <div className={fullyAttained ? "complete" :""}>
                <strong>Key Result:</strong> {keyResult.text} ({keyResult.attainment}% achieved)
                <button disabled={!canEdit} className="text tiny" onClick={() => setModalOpen(true)}><Pen/></button>
                <button disabled={!canDelete} className="text tiny" onClick={() => onDeleteKeyResult(objective.id, keyResult.id)}><TrashIcon/>
                </button>
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
                <form onSubmit={onSetKeyResultAttainment}>
                    <h4>How far along is this Key Result?</h4>
                    <input
                        type="number"
                        placeholder="Enter Key Result Text"
                        value={attainment}
                        onChange={(e) => setAttainment(Number(e.target.value))}
                        required
                    />
                    <button type="submit">Set Key Result</button>
                </form>
            </Modal>
        </li>
    )
}

type ObjectiveProps = {
    objective: Objective;
    index: number;
    stytchPermissions: PermissionsMap<Permissions>;
    setObjectives: React.Dispatch<React.SetStateAction<Objective[]>>;
}
const ObjectiveEditor = ({objective, index, stytchPermissions, setObjectives}: ObjectiveProps) => {
    const [newKeyResultText, setNewKeyResultText] = useState<string>('');
    const [modalOpen, setModalOpen] = useState(false);
    const onAddKeyResult = (evt: FormEvent, okrID: string) => {
        evt.preventDefault();
        createKeyResult(okrID, newKeyResultText).then(objectives => setObjectives(objectives));
        setNewKeyResultText('');
        setModalOpen(false);
    };

    const onDeleteObjective = (id: string) => {
        deleteObjective(id).then(objectives => setObjectives(objectives));
    };


    const canDelete = stytchPermissions.objective.delete;
    const canCreateKeyResult = stytchPermissions.key_result.create;


    return (
        <li>
            <div className="objective">
                <div className="objective-header">
                    <div>
                        <b>Objective #{index + 1}:</b> {objective.objectiveText}
                    </div>
                    <div>
                        <button disabled={!canCreateKeyResult} className="text" onClick={() => setModalOpen(true)}>
                            <PlusCircle/>
                        </button>
                        <button disabled={!canDelete} className="text" onClick={() => onDeleteObjective(objective.id)}>
                            <TrashIcon/>
                        </button>
                    </div>
                </div>

                <ul style={{marginLeft: 30}}>
                    {objective.keyResults.map((keyResult) => (
                        <KeyResultEditor
                            key={keyResult.id}
                            objective={objective}
                            keyResult={keyResult}
                            stytchPermissions={stytchPermissions}
                            setObjectives={setObjectives}
                        />
                    ))}
                    {objective.keyResults.length === 0 && (
                        <li>
                            No key results defined yet....
                        </li>
                    )}

                </ul>


                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
                    <form onSubmit={(evt) => onAddKeyResult(evt, objective.id)}>
                        <h4>Add Key Result</h4>
                        <p>
                            Add a specific, measurable result that supports the grand vision of the Objective.
                        </p>
                        <div className="input-group">
                            <input
                                type="text"
                                placeholder="Enter Key Result Text"
                                value={newKeyResultText}
                                onChange={(e) => setNewKeyResultText(e.target.value)}
                                required
                            />
                            <button type="submit" className="primary">Add Key Result</button>
                        </div>
                    </form>
                </Modal>
            </div>

        </li>
    )
}

type EditorProps = {
    stytchPermissions: PermissionsMap<Permissions>;
};
const OKREditor = ({stytchPermissions}: EditorProps) => {
    const {organization} = useStytchOrganization();
    const [objectives, setObjectives] = useState<Objective[]>([]);

    const [infoModalOpen, setInfoModalOpen] = useState(() => {
        const storedValue = sessionStorage.getItem("showInfoModal");
        return storedValue ? JSON.parse(storedValue) : true;
    });

    const [modalOpen, setModalOpen] = useState(false);
    const [newObjectiveText, setNewObjectiveText] = useState('');

    // Fetch Objectives on component mount
    useEffect(() => {
        if (stytchPermissions.objective.read) {
            getObjectives().then(objectives => setObjectives(objectives));
        }
    }, [stytchPermissions.objective.read]);

    const onAddObjective = (evt: FormEvent) => {
        evt.preventDefault();
        createObjective(newObjectiveText).then(objectives => setObjectives(objectives));
        setNewObjectiveText('');
        setModalOpen(false);
    };

    const onInfoModalClose = () => {
        sessionStorage.setItem("showInfoModal", JSON.stringify(false));
        setInfoModalOpen(false);
    }


    // Permissions
    const canCreate = stytchPermissions.objective.create;

    return (
        <main>
            <div className="okrEditor">

                <Modal isOpen={infoModalOpen} onClose={onInfoModalClose}>
                    <h3>About this Demo</h3>
                    <p>
                        The data in this demo below can be edited via the UI + REST API, or via a{' '}
                        <NavLink to="https://modelcontextprotocol.io/introduction">MCP Server</NavLink>{' '}
                        running on{' '}
                        <NavLink to="https://modelcontextprotocol.io/introduction">Cloudflare Workers</NavLink>.
                        Connect to the Server running
                        at <b>{window.location.origin}/sse</b>{' '}
                        with your MCP Client to try it out.{' '}
                        <br/>
                        <br/>
                        This demo integrates with Stytch's{' '}
                        <NavLink to={"https://stytch.com/b2b"} target="_blank">B2B Product</NavLink>{' '}
                        for Organization and Member management.{' '}
                        <NavLink to={"/settings/members"}>Invite</NavLink> some coworkers to collaborate with!
                        <br/>
                        <br/>
                        Members with the <b>CEO</b> role can create new Objectives and Key Results.{' '}
                        Members with the <b>Manager</b> role can create and edit Key Results.{' '}
                        Other members can only read the data.
                    </p>
                </Modal>

                <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
                    <form onSubmit={onAddObjective}>
                        <h3>Create a New Objective</h3>
                        <p>
                            What is a high level goal your Organization needs to accomplish?
                        </p>
                        <div className="input-group">
                            <input
                                disabled={!canCreate}
                                type="text"
                                placeholder="Enter Objective Text"
                                value={newObjectiveText}
                                onChange={(e) => setNewObjectiveText(e.target.value)}
                                required
                            />
                            <button type="submit" className="primary">Add Objective</button>
                        </div>
                    </form>
                </Modal>


                <h1>
                    Objectives and Key Results for {organization?.organization_name}
                    <button className="text" onClick={() => setInfoModalOpen(true)}><CircleHelp/></button>
                </h1>
                <ul>
                    {objectives.map((objective, i) => (
                        <ObjectiveEditor
                            key={objective.id}
                            index={i}
                            objective={objective}
                            stytchPermissions={stytchPermissions}
                            setObjectives={setObjectives}
                        />
                    ))}
                    {objectives.length === 0 && (
                        <li>
                            No objectives defined yet....
                        </li>
                    )}
                </ul>
                <button disabled={!canCreate} className="primary" onClick={() => setModalOpen(true)}>
                    Add Objective
                </button>
            </div>
        </main>
    );
}


export default withLoginRequired(withStytchPermissions<Permissions, object>(OKREditor));