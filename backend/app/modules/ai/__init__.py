"""Gateway de IA provider-agnostic.

Módulos consomem operações de alto nível (ex: ``improve_text``,
``extract_patient_document``) sem conhecer provedor/modelo. O service
resolve roteamento, failover, cifra/decifra chaves, aplica quota e loga
consumo. Trocar de OpenAI pra Claude pra Llama local não toca código
de módulo nenhum — só muda a rota em ``ai_capability_routes``.
"""
