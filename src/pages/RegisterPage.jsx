import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import Avatar from 'react-nice-avatar';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import { genConfig } from 'react-nice-avatar';
import { supabase } from '@/lib/customSupabaseClient';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn, formatPhone, validateEmail } from "@/lib/utils";

const Combobox = ({ options, value, onSelect, placeholder, emptyText, disabled = false }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {value
            ? options.find((option) => String(option.id) === String(value))?.name
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup className="max-h-60 overflow-y-auto">
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={option.name}
                onSelect={() => {
                  onSelect(String(option.id));
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    String(value) === String(option.id) ? "opacity-100" : "opacity-0"
                  )}
                />
                {option.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const RegisterPage = () => {
  const { control, register, handleSubmit, formState: { errors }, watch, setValue } = useForm();
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [avatarConfig, setAvatarConfig] = useState(genConfig());
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const selectedState = watch('state_id');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchStatesAndSetDefaults = async () => {
      const { data, error } = await supabase.from('states').select('*').order('name');
      if (error) {
        toast({ title: "Erro ao buscar estados", variant: "destructive" });
      } else {
        setStates(data);
        const pernambuco = data.find(s => s.uf === 'PE');
        if (pernambuco) {
          setValue('state_id', String(pernambuco.id));
        }
      }
    };
    fetchStatesAndSetDefaults();
  }, [toast, setValue]);

  useEffect(() => {
    if (selectedState) {
      const fetchCitiesAndSetDefault = async () => {
        const { data, error } = await supabase.from('cities').select('*').eq('state_id', selectedState).order('name');
        if (error) {
          toast({ title: "Erro ao buscar cidades", variant: "destructive" });
        } else {
          setCities(data);
          const floresta = data.find(c => c.name.toLowerCase() === 'floresta');
          if (floresta) {
            setValue('city_id', String(floresta.id));
          }
        }
      };
      fetchCitiesAndSetDefault();
    } else {
      setCities([]);
    }
  }, [selectedState, toast, setValue]);

  const randomizeAvatar = () => {
    setAvatarConfig(genConfig());
  };

  const onSubmit = async (data) => {
    if (!agreedToTerms) {
      toast({
        title: "Termos de Uso",
        description: "Você precisa aceitar os termos de uso para continuar.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    const selectedCity = cities.find(c => c.id === parseInt(data.city_id));

    // Remove formatação do telefone antes de salvar (apenas números)
    const phoneNumbers = data.phone ? data.phone.replace(/\D/g, '') : '';

    const { error } = await signUp(data.email, data.password, {
      data: {
        name: data.name,
        phone: phoneNumbers,
        city: selectedCity ? selectedCity.name : null,
        state_id: data.state_id,
        city_id: data.city_id,
        avatar_type: 'generated',
        avatar_url: null,
        avatar_config: avatarConfig,
      }
    });
    if (!error) {
      toast({
        title: "Cadastro realizado com sucesso!",
        description: "Verifique seu e-mail para confirmar sua conta.",
      });
      navigate('/login');
    } else {
      toast({
        title: "Erro no cadastro",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Cadastro - Trombone Cidadão</title>
      </Helmet>
      <div className="container mx-auto px-4 py-12 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl"
        >
          <Card className="shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold">Crie sua Conta</CardTitle>
              <CardDescription>Junte-se à comunidade e faça a diferença na sua cidade.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="flex flex-col items-center space-y-4">
                  <Avatar className="w-32 h-32" {...avatarConfig} />
                  <Button type="button" variant="ghost" onClick={randomizeAvatar} className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Gerar outro avatar
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input id="name" {...register("name", { required: "Nome é obrigatório" })} />
                  {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Controller
                      name="email"
                      control={control}
                      rules={{ 
                        required: "Email é obrigatório",
                        validate: (value) => {
                          if (!value) return "Email é obrigatório";
                          if (!validateEmail(value)) {
                            return "Email inválido. Use o formato: exemplo@email.com";
                          }
                          return true;
                        }
                      }}
                      render={({ field }) => (
                        <Input
                          id="email"
                          type="email"
                          placeholder="seu@email.com"
                          value={field.value || ''}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                          }}
                          onBlur={field.onBlur}
                          className={errors.email ? 'border-destructive' : ''}
                        />
                      )}
                    />
                    {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Controller
                      name="phone"
                      control={control}
                      rules={{ 
                        required: "Telefone é obrigatório",
                        validate: (value) => {
                          const numbers = value ? value.replace(/\D/g, '') : '';
                          if (numbers.length < 10) {
                            return "Telefone deve ter pelo menos 10 dígitos";
                          }
                          if (numbers.length > 11) {
                            return "Telefone deve ter no máximo 11 dígitos";
                          }
                          return true;
                        }
                      }}
                      render={({ field }) => (
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="(87) 99999-9999"
                          value={formatPhone(field.value || '')}
                          onChange={(e) => {
                            const formatted = formatPhone(e.target.value);
                            field.onChange(formatted);
                          }}
                          maxLength={15}
                        />
                      )}
                    />
                    {errors.phone && <p className="text-red-500 text-sm">{errors.phone.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="state_id">Estado</Label>
                    <Controller
                      name="state_id"
                      control={control}
                      rules={{ required: "Estado é obrigatório" }}
                      render={({ field }) => (
                        <Combobox
                          options={states}
                          value={field.value}
                          onSelect={field.onChange}
                          placeholder="Selecione um estado"
                          emptyText="Nenhum estado encontrado."
                          disabled={true}
                        />
                      )}
                    />
                    {errors.state_id && <p className="text-red-500 text-sm">{errors.state_id.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city_id">Cidade</Label>
                    <Controller
                      name="city_id"
                      control={control}
                      rules={{ required: "Cidade é obrigatória" }}
                      render={({ field }) => (
                        <Combobox
                          options={cities}
                          value={field.value}
                          onSelect={field.onChange}
                          placeholder="Selecione uma cidade"
                          emptyText="Nenhuma cidade encontrada."
                          disabled={true}
                        />
                      )}
                    />
                    {errors.city_id && <p className="text-red-500 text-sm">{errors.city_id.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} {...register("password", { required: "Senha é obrigatória", minLength: { value: 6, message: "A senha deve ter no mínimo 6 caracteres" } })} />
                    <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={setAgreedToTerms} />
                  <label htmlFor="terms" className="text-sm font-medium leading-none">
                    Eu li e concordo com os <Link to="/termos-de-uso" className="underline text-primary">Termos de Uso</Link>.
                  </label>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </Button>
              </form>
              <div className="mt-6 text-center">
                <p className="text-sm">
                  Já tem uma conta? <Link to="/login" className="font-semibold text-primary hover:underline">Faça login</Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default RegisterPage;