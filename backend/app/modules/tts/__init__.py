"""Módulo TTS (Text-to-Speech).

Integra ElevenLabs e Google TTS com cache agressivo por fragmento em
storage (S3/MinIO). A recepção/painel/totem consomem via
``POST /rec/tts/prepare`` que devolve URLs a serem tocadas em sequência.
"""
