"""
Knowledge Graph Service
=======================
Loads NCERT/CBSE subject knowledge graphs from JSON definitions,
builds NetworkX directed graphs, and provides prerequisite-aware queries.

Graph direction: prerequisite → topic  (A → B means "learn A before B")
"""

import json
import networkx as nx
from pathlib import Path
from collections import defaultdict


# Resolve data directory relative to this file
_DATA_DIR = Path(__file__).parent.parent / "data" / "knowledge_graphs"


class KnowledgeGraphService:
    """
    Loads all JSON knowledge graph files on init and exposes query methods.

    Graph convention:
        node  = topic_id (str)
        edge  = prerequisite → topic   (directed)
        node attributes stored as node data in the DiGraph
    """

    def __init__(self):
        self.graphs: dict[str, nx.DiGraph] = {}   # key → DiGraph
        self.metadata: dict[str, dict] = {}        # key → raw JSON
        self._load_all_graphs()

    # ── Loading ───────────────────────────────────────────────────────────────

    def _load_all_graphs(self) -> None:
        """
        Discover all JSON files in data/knowledge_graphs/ and build a
        NetworkX DiGraph for each. Silently skips malformed files.
        """
        if not _DATA_DIR.exists():
            return

        for json_file in _DATA_DIR.glob("*.json"):
            try:
                with open(json_file, encoding="utf-8") as f:
                    data = json.load(f)

                subject = data.get("subject", "")
                board   = data.get("board", "")
                grade   = data.get("grade", "")
                key     = self.get_graph_key(subject, board, grade)

                G = nx.DiGraph()
                for topic in data.get("topics", []):
                    tid = topic["id"]
                    # Store all metadata as node attributes
                    G.add_node(tid, **{k: v for k, v in topic.items() if k != "prerequisites"})
                    for prereq_id in topic.get("prerequisites", []):
                        G.add_edge(prereq_id, tid)  # prereq → topic

                self.graphs[key]   = G
                self.metadata[key] = data

            except Exception as e:
                print(f"[KnowledgeGraphService] Failed to load {json_file.name}: {e}")

    # ── Key helper ────────────────────────────────────────────────────────────

    def get_graph_key(self, subject: str, board: str, grade: str) -> str:
        """
        Normalise (subject, board, grade) into a dict key.

        Example: ("Mathematics", "CBSE", "Class 12") → "mathematics_cbse_class12"
        """
        def norm(s: str) -> str:
            return s.strip().lower().replace(" ", "")

        return f"{norm(subject)}_{norm(board)}_{norm(grade)}"

    def _get_graph(self, subject: str, board: str, grade: str) -> nx.DiGraph | None:
        key = self.get_graph_key(subject, board, grade)
        return self.graphs.get(key)

    # ── Query Methods ─────────────────────────────────────────────────────────

    def get_prerequisites(
        self, topic_id: str, subject: str, board: str, grade: str
    ) -> list[str]:
        """
        Return direct prerequisite topic_ids for the given topic.
        (One hop only — i.e. immediate predecessors in the graph.)

        Returns [] if topic not found or no prerequisites.
        """
        G = self._get_graph(subject, board, grade)
        if G is None or topic_id not in G:
            return []
        return list(G.predecessors(topic_id))

    def get_all_prerequisites_recursive(
        self, topic_id: str, subject: str, board: str, grade: str
    ) -> list[str]:
        """
        Return ALL ancestors of topic_id in prerequisite order
        (most foundational first, using topological sort of the ancestor subgraph).

        Returns [] if topic not found.
        """
        G = self._get_graph(subject, board, grade)
        if G is None or topic_id not in G:
            return []

        ancestors = nx.ancestors(G, topic_id)
        if not ancestors:
            return []

        subgraph = G.subgraph(ancestors)
        try:
            return list(nx.topological_sort(subgraph))
        except nx.NetworkXUnfeasible:
            return list(ancestors)

    def get_dependent_topics(
        self, topic_id: str, subject: str, board: str, grade: str
    ) -> list[str]:
        """
        Return all topic_ids that directly or indirectly DEPEND on topic_id
        (i.e. descendants — topics the student can unlock after mastering this one).

        Returns [] if topic not found.
        """
        G = self._get_graph(subject, board, grade)
        if G is None or topic_id not in G:
            return []
        return list(nx.descendants(G, topic_id))

    def get_learning_order(
        self, topic_ids: list[str], subject: str, board: str, grade: str
    ) -> list[str]:
        """
        Given an arbitrary set of topic_ids, return them in correct learning order
        (topological sort of the induced subgraph).

        Topics with no edges among the selected set retain their relative order
        from the full topological sort.

        Returns: ordered list of topic_ids. Unknown ids are appended at the end.
        """
        G = self._get_graph(subject, board, grade)
        if G is None:
            return topic_ids

        known   = [t for t in topic_ids if t in G]
        unknown = [t for t in topic_ids if t not in G]

        if not known:
            return topic_ids

        subgraph = G.subgraph(known)
        try:
            ordered = list(nx.topological_sort(subgraph))
        except nx.NetworkXUnfeasible:
            ordered = known

        return ordered + unknown

    def find_root_cause_gaps(
        self, gap_topic_ids: list[str], subject: str, board: str, grade: str
    ) -> list[dict]:
        """
        Given detected gap topics, surface the ROOT CAUSE prerequisite gaps —
        the foundational topics whose mastery would resolve the most downstream gaps.

        Algorithm:
            1. For each gap topic, walk its full prerequisite chain.
            2. Tally how many gap topics each prerequisite appears in
               (its "impact score").
            3. Return prerequisites sorted by impact_score DESC.

        Returns:
            list of {
                topic_id:     str,
                topic_name:   str,
                impact_score: int,      # number of gap topics this fixes
                fixes_gaps:   [str]     # topic_ids it's a prerequisite of
            }
        """
        G = self._get_graph(subject, board, grade)
        if G is None:
            return []

        prereq_impact: dict[str, list[str]] = defaultdict(list)

        for gap_id in gap_topic_ids:
            if gap_id not in G:
                continue
            ancestors = nx.ancestors(G, gap_id)
            for anc in ancestors:
                prereq_impact[anc].append(gap_id)

        results = []
        for prereq_id, fixed_gaps in prereq_impact.items():
            node_data = G.nodes.get(prereq_id, {})
            results.append({
                "topic_id":     prereq_id,
                "topic_name":   node_data.get("name", prereq_id),
                "impact_score": len(fixed_gaps),
                "fixes_gaps":   fixed_gaps,
            })

        results.sort(key=lambda x: x["impact_score"], reverse=True)
        return results

    def get_topic_difficulty_avg(
        self, topic_id: str, subject: str, board: str, grade: str
    ) -> float:
        """
        Compute the weighted average difficulty of a topic and all its prerequisites.
        Used by the IRT service to set the baseline difficulty for gap classification.

        Returns the topic's own difficulty_level if no prerequisites exist.
        Returns 3.0 as fallback if topic not found.
        """
        G = self._get_graph(subject, board, grade)
        if G is None or topic_id not in G:
            return 3.0

        # Collect topic + all ancestors
        relevant = {topic_id} | nx.ancestors(G, topic_id)
        difficulties = [
            G.nodes[t].get("difficulty_level", 3)
            for t in relevant
            if t in G.nodes
        ]

        return sum(difficulties) / len(difficulties) if difficulties else 3.0

    def get_subject_topics(
        self, subject: str, board: str, grade: str
    ) -> list[dict]:
        """
        Return all topics for a subject in correct learning order (topological sort).
        Each dict contains all node attributes plus the topic_id.

        Returns [] if the graph is not loaded.
        """
        G = self._get_graph(subject, board, grade)
        if G is None:
            return []

        try:
            ordered_ids = list(nx.topological_sort(G))
        except nx.NetworkXUnfeasible:
            ordered_ids = list(G.nodes)

        topics = []
        for tid in ordered_ids:
            data = dict(G.nodes[tid])
            data["topic_id"] = tid
            data["prerequisites"] = list(G.predecessors(tid))
            data["dependents"]    = list(G.successors(tid))
            topics.append(data)

        return topics

    def list_available_graphs(self) -> list[dict]:
        """Return summary of all loaded knowledge graphs."""
        out = []
        for key, data in self.metadata.items():
            out.append({
                "key":          key,
                "subject":      data.get("subject"),
                "board":        data.get("board"),
                "grade":        data.get("grade"),
                "topic_count":  len(data.get("topics", [])),
            })
        return out


# ── Module-level singleton ────────────────────────────────────────────────────
_service_instance: KnowledgeGraphService | None = None


def get_knowledge_graph_service() -> KnowledgeGraphService:
    """Lazy singleton — loads graphs once at first call."""
    global _service_instance
    if _service_instance is None:
        _service_instance = KnowledgeGraphService()
    return _service_instance
