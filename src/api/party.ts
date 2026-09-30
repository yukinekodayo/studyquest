import { rpc } from './rpc';

export const fetchPartyRooms = () => rpc('study_party_rooms');
export const joinStudyParty = (subject: string) => rpc('join_study_party', { p_subject: subject });
