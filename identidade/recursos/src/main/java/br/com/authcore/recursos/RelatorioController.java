package br.com.authcore.recursos;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Recurso de exemplo. Dados simulados: o que importa aqui é quem consegue ler.
 */
@RestController
@RequestMapping("/api/relatorios")
public class RelatorioController {

    @GetMapping
    public Map<String, Object> listar(@AuthenticationPrincipal Jwt token) {
        return Map.of(
                "solicitante", token.getSubject(),
                "relatorios", List.of(
                        Map.of("id", 1, "titulo", "Acessos do mês (dados simulados)"),
                        Map.of("id", 2, "titulo", "Falhas de login por dia (dados simulados)")));
    }
}
