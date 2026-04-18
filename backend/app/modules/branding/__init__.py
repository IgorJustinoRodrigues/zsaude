"""Identidade visual configurável por município e unidade.

O módulo ``branding`` define a tabela ``branding_configs`` e a lógica
de **cascade** (unidade → cidade → padrão do sistema) usada pra compor
a identidade visual dos PDFs, painéis e outros artefatos gerados.

A config tem dois "escopos" (``scope_type``):

- ``municipality`` — aplica a todas as unidades do município que não
  tenham config própria.
- ``facility`` — override da unidade específica.

No resolver (``effective_for_facility``), cada campo é testado em ordem:

1. Config da unidade, se preenchido.
2. Config da cidade, se preenchido.
3. Default do sistema (ver ``brand.py``).
"""

from app.modules.branding.models import BrandingConfig, BrandingScope

__all__ = ["BrandingConfig", "BrandingScope"]
