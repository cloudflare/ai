import {Objective, KeyResult} from "../types";

const DEFAULT_OKRS = [{
    id: 'okr_0',
    objectiveText: 'Define OKRs for your Enterprise Business',
    keyResults: [
        {
            id: 'kr_0',
            text: 'Define three OKRs to drive Enterprise Synergy',
            attainment: 0,
        },
        {
            id: 'kr_1',
            text: 'Make a powerpoint presentation on OKRs for the Company Offsite',
            attainment: 0,
        }
    ]
}]

/**
 * The `OKRService` class provides methods for managing a set of OKRs backed by Cloudflare KV storage.
 * This includes operations such as retrieving OKRs, adding new OKRs,
 * deleting OKRs, and
 */
class OKRService {
    constructor(
        private env: Env,
        private organizationID: string,
    ) {
    }

    /** Objective CRUD */

    get = async (): Promise<Objective[]> => {
        const okrs = await this.env.OKRManagerKV.get<Objective[]>(this.organizationID, "json")
        if (!okrs) {
            return this.#set(DEFAULT_OKRS)
        }
        return okrs;
    }

    #set = async (okrs: Objective[]): Promise<Objective[]> => {
        const sorted = okrs.sort((t1, t2) => {
            return t1.id.localeCompare(t2.id);
        });

        await this.env.OKRManagerKV.put(this.organizationID, JSON.stringify(sorted))
        return sorted
    }

    addObjective = async (objectiveText: string): Promise<Objective[]> => {
        const okrs = await this.get()
        const newOkr: Objective = {
            id: `okr_${Date.now().toString()}`,
            objectiveText: objectiveText,
            keyResults: [],
        }
        okrs.push(newOkr)
        return this.#set(okrs)
    }

    deleteObjective = async (okrID: string): Promise<Objective[]> => {
        const okrs = await this.get()
        const cleaned = okrs.filter(o => o.id !== okrID);
        return this.#set(cleaned);
    }

    /** Key Result CRUD */

    addKeyResult = async (okrID: string, keyResultText: string): Promise<Objective[]> => {
        const okrs = await this.get()
        const okr = okrs.find(o => o.id === okrID)
        if (!okr) {
            throw new Error(`OKR with ID ${okrID} not found`)
        }
        const newKeyResult: KeyResult = {
            id: `kr_${Date.now().toString()}`,
            text: keyResultText,
            attainment: 0,
        }
        okr.keyResults.push(newKeyResult)
        return this.#set(okrs)
    }

    setKeyResultAttainment = async (okrID: string, keyResultID: string, attainment: number): Promise<Objective[]> => {
        const okrs = await this.get()
        const okr = okrs.find(o => o.id === okrID)
        if (!okr) {
            throw new Error(`OKR with ID ${okrID} not found`)
        }
        const keyResult = okr.keyResults.find(o => o.id === keyResultID)
        if (!keyResult) {
            throw new Error(`Key Result with ID ${keyResultID} not found`)
        }
        keyResult.attainment = attainment
        return this.#set(okrs)
    }

    deleteKeyResult = async (okrID: string, keyResultID: string): Promise<Objective[]> => {
        const okrs = await this.get()
        const okr = okrs.find(o => o.id === okrID)
        if (!okr) {
            throw new Error(`OKR with ID ${okrID} not found`)
        }
        okr.keyResults = okr.keyResults.filter(o => o.id !== keyResultID);
        return this.#set(okrs)
    }


}

export const okrService = (env: Env, organizationID: string) => new OKRService(env, organizationID)