package br.com.authcore.recursos;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * O Kong já confere a assinatura, mas o serviço não confia nisso: valida o
 * token de novo, com emissor, audiência e papel. Se alguém chegar ao serviço
 * sem passar pelo Kong, a porta continua fechada.
 */
@Configuration
public class ConfiguracaoDeSeguranca {

    private static final Logger LOG = LoggerFactory.getLogger(ConfiguracaoDeSeguranca.class);

    @Bean
    SecurityFilterChain seguranca(HttpSecurity http) throws Exception {
        http
                .authorizeHttpRequests(regras -> regras
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/actuator/**").denyAll()
                        .requestMatchers(HttpMethod.GET, "/api/relatorios/**").hasRole("analista")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(rs -> rs
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(papeisDoKeycloak()))
                        .authenticationEntryPoint(recusaSemDetalhe()))
                .exceptionHandling(e -> e.authenticationEntryPoint(recusaSemDetalhe()))
                // Token só no cabeçalho Authorization, sem cookie nem sessão:
                // o navegador não anexa o token sozinho, então não há CSRF.
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(csrf -> csrf.disable())
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        .frameOptions(f -> f.deny()));
        return http.build();
    }

    /**
     * O padrão do Spring devolve no WWW-Authenticate o motivo exato da recusa e o
     * endereço interno do serviço. Para quem está de fora basta saber que o token
     * não vale; o motivo fica no log.
     */
    static AuthenticationEntryPoint recusaSemDetalhe() {
        return (requisicao, resposta, erro) -> {
            LOG.info("Token recusado: {}", erro.getMessage());
            resposta.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer error=\"invalid_token\"");
            resposta.setStatus(HttpStatus.UNAUTHORIZED.value());
        };
    }

    /** O Keycloak põe os papéis em {@code realm_access.roles}; o Spring espera {@code ROLE_}. */
    static Converter<Jwt, AbstractAuthenticationToken> papeisDoKeycloak() {
        return jwt -> {
            Map<String, Object> realm = jwt.getClaimAsMap("realm_access");
            Collection<?> papeis = realm == null ? List.of() : (Collection<?>) realm.getOrDefault("roles", List.of());
            List<GrantedAuthority> autoridades = papeis.stream()
                    .map(String::valueOf)
                    .<GrantedAuthority>map(papel -> new SimpleGrantedAuthority("ROLE_" + papel))
                    .toList();
            return new JwtAuthenticationToken(jwt, autoridades, jwt.getSubject());
        };
    }
}
